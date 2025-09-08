const mysql = require('mysql2/promise');
const Logger = require('./Logger');

class Database {
    constructor() {
        this.pool = null;
        this.connected = false;
    }

    /**
     * Initialize database connection pool
     */
    async initialize() {
        try {
            Logger.loading('Connecting to MySQL database...');

            this.pool = mysql.createPool({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 3306,
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'discord_bot',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                // MySQL2 specific options
                charset: 'utf8mb4',
                timezone: '+00:00',
                // Connection timeout (in milliseconds)
                connectTimeout: 60000
            });

            // Test connection
            const connection = await this.pool.getConnection();
            await connection.ping();
            connection.release();

            this.connected = true;
            Logger.success('✅ Connected to MySQL database successfully');

            // Create tables if they don't exist
            await this.createTables();

        } catch (error) {
            Logger.error(`❌ Failed to connect to MySQL: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create necessary tables
     */
    async createTables() {
        try {
            Logger.loading('Setting up database tables...');

            // User statistics table
            await this.execute(`
                CREATE TABLE IF NOT EXISTS user_stats (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(20) NOT NULL UNIQUE,
                    username VARCHAR(50),
                    games_played INT DEFAULT 0,
                    games_won INT DEFAULT 0,
                    total_score INT DEFAULT 0,
                    best_score INT DEFAULT 0,
                    last_played DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_user_id (user_id),
                    INDEX idx_last_played (last_played)
                )
            `);

            // Game sessions table
            await this.execute(`
                CREATE TABLE IF NOT EXISTS game_sessions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(20) NOT NULL,
                    game_type VARCHAR(50) NOT NULL,
                    score INT DEFAULT 0,
                    attempts INT DEFAULT 0,
                    won BOOLEAN DEFAULT FALSE,
                    duration_seconds INT DEFAULT 0,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    ended_at DATETIME,
                    INDEX idx_user_id (user_id),
                    INDEX idx_game_type (game_type),
                    INDEX idx_started_at (started_at)
                )
            `);

            // Module configurations table
            await this.execute(`
                CREATE TABLE IF NOT EXISTS module_configs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    module_name VARCHAR(50) NOT NULL UNIQUE,
                    enabled BOOLEAN DEFAULT TRUE,
                    config_data JSON,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_module_name (module_name)
                )
            `);

            // Bot settings table
            await this.execute(`
                CREATE TABLE IF NOT EXISTS bot_settings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    setting_key VARCHAR(100) NOT NULL UNIQUE,
                    setting_value TEXT,
                    setting_type VARCHAR(20) DEFAULT 'string',
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_setting_key (setting_key)
                )
            `);

            Logger.success('✅ Database tables created successfully');

        } catch (error) {
            Logger.error(`❌ Failed to create tables: ${error.message}`);
            throw error;
        }
    }

    /**
     * Execute a SQL query
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise} Query result
     */
    async execute(query, params = []) {
        if (!this.connected) {
            throw new Error('Database not connected');
        }

        try {
            const [results] = await this.pool.execute(query, params);
            return results;
        } catch (error) {
            Logger.error(`SQL Error: ${error.message}`);
            Logger.debug(`Query: ${query}`);
            Logger.debug(`Params: ${JSON.stringify(params)}`);
            throw error;
        }
    }

    /**
     * Get user statistics
     * @param {string} userId - Discord user ID
     * @returns {Promise<Object>} User stats
     */
    async getUserStats(userId) {
        const query = `
            SELECT * FROM user_stats 
            WHERE user_id = ?
        `;
        const results = await this.execute(query, [userId]);
        return results[0] || null;
    }

    /**
     * Update user statistics
     * @param {string} userId - Discord user ID
     * @param {string} username - Discord username
     * @param {Object} stats - Stats to update
     */
    async updateUserStats(userId, username, stats = {}) {
        const existingStats = await this.getUserStats(userId);

        if (existingStats) {
            // Update existing user
            const updates = [];
            const params = [];

            if (username) {
                updates.push('username = ?');
                params.push(username);
            }

            Object.keys(stats).forEach(key => {
                if (['games_played', 'games_won', 'total_score', 'best_score'].includes(key)) {
                    updates.push(`${key} = ?`);
                    params.push(stats[key]);
                }
            });

            if (updates.length > 0) {
                updates.push('last_played = CURRENT_TIMESTAMP');
                params.push(userId);

                const query = `
                    UPDATE user_stats 
                    SET ${updates.join(', ')}
                    WHERE user_id = ?
                `;
                await this.execute(query, params);
            }
        } else {
            // Create new user
            const query = `
                INSERT INTO user_stats (user_id, username, games_played, games_won, total_score, best_score)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            await this.execute(query, [
                userId,
                username || 'Unknown',
                stats.games_played || 0,
                stats.games_won || 0,
                stats.total_score || 0,
                stats.best_score || 0
            ]);
        }
    }

    /**
     * Add game session record
     * @param {Object} session - Game session data
     */
    async addGameSession(session) {
        const query = `
            INSERT INTO game_sessions (user_id, game_type, score, attempts, won, duration_seconds, ended_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        await this.execute(query, [
            session.userId,
            session.gameType,
            session.score || 0,
            session.attempts || 0,
            session.won || false,
            session.duration || 0
        ]);
    }

    /**
     * Get top players for a game
     * @param {string} gameType - Type of game
     * @param {number} limit - Number of top players
     * @returns {Promise<Array>} Top players
     */
    async getTopPlayers(gameType = null, limit = 10) {
        let query;
        let params = [limit];

        if (gameType) {
            query = `
                SELECT u.username, u.user_id, COUNT(g.id) as games_played, 
                       SUM(g.won) as games_won, MAX(g.score) as best_score,
                       AVG(g.score) as avg_score
                FROM user_stats u
                LEFT JOIN game_sessions g ON u.user_id = g.user_id AND g.game_type = ?
                WHERE u.games_played > 0
                GROUP BY u.user_id, u.username
                ORDER BY best_score DESC, games_won DESC
                LIMIT ?
            `;
            params = [gameType, limit];
        } else {
            query = `
                SELECT username, user_id, games_played, games_won, total_score, best_score
                FROM user_stats
                WHERE games_played > 0
                ORDER BY best_score DESC, games_won DESC
                LIMIT ?
            `;
        }

        return await this.execute(query, params);
    }

    /**
     * Get or create module configuration
     * @param {string} moduleName - Module name
     * @returns {Promise<Object>} Module config
     */
    async getModuleConfig(moduleName) {
        const query = `
            SELECT * FROM module_configs 
            WHERE module_name = ?
        `;
        const results = await this.execute(query, [moduleName]);
        return results[0] || null;
    }

    /**
     * Save module configuration
     * @param {string} moduleName - Module name
     * @param {boolean} enabled - Module enabled status
     * @param {Object} configData - Module configuration data
     */
    async saveModuleConfig(moduleName, enabled, configData = {}) {
        const existing = await this.getModuleConfig(moduleName);

        if (existing) {
            const query = `
                UPDATE module_configs 
                SET enabled = ?, config_data = ?
                WHERE module_name = ?
            `;
            await this.execute(query, [enabled, JSON.stringify(configData), moduleName]);
        } else {
            const query = `
                INSERT INTO module_configs (module_name, enabled, config_data)
                VALUES (?, ?, ?)
            `;
            await this.execute(query, [moduleName, enabled, JSON.stringify(configData)]);
        }
    }

    /**
     * Get bot setting
     * @param {string} key - Setting key
     * @returns {Promise<any>} Setting value
     */
    async getSetting(key) {
        const query = `
            SELECT setting_value, setting_type FROM bot_settings 
            WHERE setting_key = ?
        `;
        const results = await this.execute(query, [key]);

        if (results.length === 0) return null;

        const { setting_value, setting_type } = results[0];

        // Convert based on type
        switch (setting_type) {
            case 'number':
                return parseFloat(setting_value);
            case 'boolean':
                return setting_value === 'true';
            case 'json':
                return JSON.parse(setting_value);
            default:
                return setting_value;
        }
    }

    /**
     * Save bot setting
     * @param {string} key - Setting key
     * @param {any} value - Setting value
     * @param {string} type - Value type
     * @param {string} description - Setting description
     */
    async setSetting(key, value, type = 'string', description = '') {
        let stringValue = value;

        if (type === 'json') {
            stringValue = JSON.stringify(value);
        } else {
            stringValue = String(value);
        }

        const existing = await this.getSetting(key);

        if (existing !== null) {
            const query = `
                UPDATE bot_settings 
                SET setting_value = ?, setting_type = ?, description = ?
                WHERE setting_key = ?
            `;
            await this.execute(query, [stringValue, type, description, key]);
        } else {
            const query = `
                INSERT INTO bot_settings (setting_key, setting_value, setting_type, description)
                VALUES (?, ?, ?, ?)
            `;
            await this.execute(query, [key, stringValue, type, description]);
        }
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.pool) {
            Logger.info('Closing database connection...');
            await this.pool.end();
            this.connected = false;
            Logger.success('Database connection closed');
        }
    }

    /**
     * Get database statistics
     * @returns {Promise<Object>} Database stats
     */
    async getStats() {
        const stats = {};

        try {
            // Total users
            const [userCount] = await this.execute('SELECT COUNT(*) as count FROM user_stats');
            stats.totalUsers = userCount.count;

            // Total games played
            const [gameCount] = await this.execute('SELECT COUNT(*) as count FROM game_sessions');
            stats.totalGames = gameCount.count;

            // Games played today
            const [todayGames] = await this.execute(`
                SELECT COUNT(*) as count FROM game_sessions 
                WHERE DATE(started_at) = CURDATE()
            `);
            stats.gamesToday = todayGames.count;

            // Active modules
            const [moduleCount] = await this.execute('SELECT COUNT(*) as count FROM module_configs WHERE enabled = true');
            stats.activeModules = moduleCount.count;

        } catch (error) {
            Logger.error(`Error getting database stats: ${error.message}`);
        }

        return stats;
    }
}

module.exports = new Database();
