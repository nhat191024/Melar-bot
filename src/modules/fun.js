const Logger = require('../utils/Logger');
const Database = require('../utils/Database');
const fs = require('fs');
const path = require('path');

class FunModule {
    constructor(client) {
        this.client = client;
        this.name = 'fun';
        this.description = 'Fun commands and entertainment features';
        this.enabled = true;
        this.version = '1.0.0';

        // Module-specific data
        this.jokes = [];
        this.facts = [];
        this.gameStats = new Map(); // User game statistics
        this.activeGames = new Map(); // Active games in channels
    }

    async load() {
        Logger.loading(`Loading ${this.name} module v${this.version}...`);

        try {
            // Load jokes and facts from files
            await this.loadData();

            // Setup module-specific intervals/timers
            this.setupAutoFeatures();

            Logger.module(`${this.name} module method loaded successfully`);
        } catch (error) {
            Logger.error(`Failed to load ${this.name} module: ${error.message}`);
            throw error;
        }
    }

    async unload() {
        Logger.info(`Unloading ${this.name} module...`);

        try {
            // Clear intervals and timers
            this.clearAutoFeatures();

            // Clear maps and arrays
            this.activeGames.clear();
            this.gameStats.clear();
            this.jokes = [];
            this.facts = [];

            Logger.success(`${this.name} module unloaded successfully`);
        } catch (error) {
            Logger.error(`Error unloading ${this.name} module: ${error.message}`);
        }
    }

    async reload() {
        await this.unload();
        await this.load();
    }

    // Load jokes and facts from data files
    async loadData() {
        const dataPath = path.join(__dirname, '../data/fun');

        // Ensure data directory exists
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(dataPath, { recursive: true });
        }

        // Load jokes
        const jokesFile = path.join(dataPath, 'jokes.json');
        if (fs.existsSync(jokesFile)) {
            const jokesData = JSON.parse(fs.readFileSync(jokesFile, 'utf8'));
            this.jokes = jokesData.jokes || [];
        } else {
            // Create default jokes file
            this.jokes = [
                "Tại sao con gà băng qua đường? Để sang bên kia!",
                "Một con vịt đi vào quán cà phê và gọi một ly nước. Chủ quán hỏi: 'Vịt biết nói à?' Vịt đáp: 'Chủ quán biết nghe à?'",
                "Cá gì không biết bơi? Cá khô!",
                "Tại sao máy tính không bao giờ đói? Vì nó luôn có byte!",
                "Con mèo thích học môn gì nhất? Mèo-thuật!"
            ];
            fs.writeFileSync(jokesFile, JSON.stringify({ jokes: this.jokes }, null, 2));
        }

        // Load facts
        const factsFile = path.join(dataPath, 'facts.json');
        if (fs.existsSync(factsFile)) {
            const factsData = JSON.parse(fs.readFileSync(factsFile, 'utf8'));
            this.facts = factsData.facts || [];
        } else {
            // Create default facts file
            this.facts = [
                "Nước mắm là một loại gia vị truyền thống của Việt Nam, được làm từ cá lên men.",
                "Việt Nam là nước xuất khẩu hạt điều lớn nhất thế giới.",
                "Cà phê trứng là một đặc sản nổi tiếng của Hà Nội.",
                "Vịnh Hạ Long được UNESCO công nhận là Di sản Thiên nhiên Thế giới.",
                "Áo dài là trang phục truyền thống của người Việt Nam."
            ];
            fs.writeFileSync(factsFile, JSON.stringify({ facts: this.facts }, null, 2));
        }
    }

    // Setup automatic features (like scheduled messages)
    setupAutoFeatures() {
        // Example: Auto-post a fact every hour in a specific channel
        // this.factInterval = setInterval(() => {
        //     this.postRandomFact();
        // }, 3600000); // 1 hour
    }

    // Clear automatic features
    clearAutoFeatures() {
        if (this.factInterval) {
            clearInterval(this.factInterval);
        }
    }

    // Module-specific methods
    getRandomJoke() {
        if (this.jokes.length === 0) return "No jokes available!";
        return this.jokes[Math.floor(Math.random() * this.jokes.length)];
    }

    getRandomFact() {
        if (this.facts.length === 0) return "No facts available!";
        return this.facts[Math.floor(Math.random() * this.facts.length)];
    }

    // Add joke to collection
    addJoke(joke) {
        this.jokes.push(joke);
        const jokesFile = path.join(__dirname, '../data/fun/jokes.json');
        fs.writeFileSync(jokesFile, JSON.stringify({ jokes: this.jokes }, null, 2));
    }

    // Add fact to collection
    addFact(fact) {
        this.facts.push(fact);
        const factsFile = path.join(__dirname, '../data/fun/facts.json');
        fs.writeFileSync(factsFile, JSON.stringify({ facts: this.facts }, null, 2));
    }

    // Game statistics methods - now using MySQL
    async getUserStats(userId) {
        try {
            const stats = await Database.getUserStats(userId);
            return stats || {
                user_id: userId,
                username: 'Unknown',
                games_played: 0,
                games_won: 0,
                total_score: 0,
                best_score: 0,
                last_played: null
            };
        } catch (error) {
            Logger.error(`Error getting user stats: ${error.message}`);
            return {
                user_id: userId,
                username: 'Unknown',
                games_played: 0,
                games_won: 0,
                total_score: 0,
                best_score: 0,
                last_played: null
            };
        }
    }

    async updateUserStats(userId, username, gameResult) {
        try {
            const currentStats = await this.getUserStats(userId);

            const newStats = {
                games_played: (currentStats.games_played || 0) + 1,
                games_won: (currentStats.games_won || 0) + (gameResult.won ? 1 : 0),
                total_score: (currentStats.total_score || 0) + (gameResult.score || 0),
                best_score: Math.max(currentStats.best_score || 0, gameResult.score || 0)
            };

            await Database.updateUserStats(userId, username, newStats);

            // Also save the game session
            await Database.addGameSession({
                userId: userId,
                gameType: gameResult.gameType || 'unknown',
                score: gameResult.score || 0,
                attempts: gameResult.attempts || 0,
                won: gameResult.won || false,
                duration: gameResult.duration || 0
            });

            Logger.debug(`Updated stats for user ${username} (${userId})`);
        } catch (error) {
            Logger.error(`Error updating user stats: ${error.message}`);
        }
    }

    // Check if game is active in channel
    isGameActive(channelId) {
        return this.activeGames.has(channelId);
    }

    // Start a game in channel
    startGame(channelId, gameType, gameData = {}) {
        this.activeGames.set(channelId, {
            type: gameType,
            startTime: Date.now(),
            ...gameData
        });
    }

    // End a game in channel
    endGame(channelId) {
        return this.activeGames.delete(channelId);
    }

    // Get active game in channel
    getActiveGame(channelId) {
        return this.activeGames.get(channelId);
    }

    // Get module info
    async getModuleInfo() {
        try {
            const dbStats = await Database.getStats();
            return {
                name: this.name,
                description: this.description,
                version: this.version,
                enabled: this.enabled,
                stats: {
                    jokes: this.jokes.length,
                    facts: this.facts.length,
                    activeGames: this.activeGames.size,
                    totalUsers: dbStats.totalUsers || 0,
                    totalGames: dbStats.totalGames || 0,
                    gamesToday: dbStats.gamesToday || 0
                }
            };
        } catch (error) {
            Logger.error(`Error getting module info: ${error.message}`);
            return {
                name: this.name,
                description: this.description,
                version: this.version,
                enabled: this.enabled,
                stats: {
                    jokes: this.jokes.length,
                    facts: this.facts.length,
                    activeGames: this.activeGames.size,
                    totalUsers: 0,
                    totalGames: 0,
                    gamesToday: 0
                }
            };
        }
    }

    // Module health check
    healthCheck() {
        const issues = [];

        if (this.jokes.length === 0) {
            issues.push('No jokes loaded');
        }

        if (this.facts.length === 0) {
            issues.push('No facts loaded');
        }

        return {
            healthy: issues.length === 0,
            issues: issues
        };
    }
}

module.exports = FunModule;
