const Logger = require('../utils/Logger');
const Database = require('../utils/Database');

class UtilityModule {
    constructor(client) {
        this.client = client;
        this.name = 'utility';
        this.description = 'Basic utility commands and features';
        this.enabled = true;
        this.version = '1.0.0';
    }

    async load() {
        Logger.loading(`Loading ${this.name} module...`);

        await this.createTables();

        Logger.module(`${this.name} module method loaded successfully`);
    }

    async unload() {
        try {

            //unload method here

            Logger.module(`${this.name} module unloaded successfully`);
        } catch (error) {
            Logger.error(`Failed to unload ${this.name} module: ${error.message}`);
        }
    }

    async reload() {
        await this.unload();
        await this.load();
    }

    async createTables() {
        try {
            const query = `
                    CREATE TABLE IF NOT EXISTS notes (
                        id INT AUTO_INCREMENT PRIMARY KEY,  
                        user_id VARCHAR(20) NOT NULL,
                        content TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_user_note (user_id, id)
                    )
                `;

            await Database.execute(query);
        } catch (error) {
            Logger.error(`Failed to create notes table: ${error.message}`);
            throw error;
        }
    }

    /**
     *  Create a new note for a user
     * @param {string} userId - The ID of the user
     * @param {string} content - The content of the note
     */
    async createNote(userId, content) {
        try {
            const query = `
                INSERT INTO notes (user_id, content)
                VALUES (?, ?)
            `;
            const id = await Database.execute(query, [userId, content]).then(result => result.insertId);
            Logger.info(`Note created for user ${userId}`);
            return id;
        } catch (error) {
            Logger.error(`Failed to create note: ${error.message}`);
            throw error;
        }
    }

    /**
     *  Get notes for a user
     */
    async getNotes(userId) {
        try {
            const query = `
                SELECT * FROM notes WHERE user_id = ?
            `;
            const results = await Database.execute(query, [userId]);
            return results;
        } catch (error) {
            Logger.error(`Failed to get notes: ${error.message}`);
            throw error;
        }
    }

    /**
     * Remove a note from user
     */
    async removeNote(userId, noteId) {
        try {
            const query = `
                DELETE FROM notes WHERE user_id = ? AND id = ?
            `;
            const result = await Database.execute(query, [userId, noteId]);
            return result.affectedRows > 0;
        } catch (error) {
            Logger.error(`Failed to remove note: ${error.message}`);
            throw error;
        }
    }

    // Module-specific methods can be added here
    getModuleInfo() {
        return {
            name: this.name,
            description: this.description,
            enabled: this.enabled,
            commands: this.client.moduleManager.commands.size,
            events: this.client.moduleManager.events.size
        };
    }
}

module.exports = UtilityModule;
