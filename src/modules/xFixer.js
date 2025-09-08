const Logger = require('../utils/Logger');
const Database = require('../utils/Database');

class XFixerModule {
    constructor(client) {
        this.client = client;
        this.name = 'XFixer';
        this.description = 'Automatically fixes X.com (Twitter) links to use fixvx.com for better embeds';
        this.enabled = true;
        this.version = '1.1.0';
        this.linksFixed = 0;
    }

    async load() {
        Logger.loading(`Loading ${this.name} module v${this.version}...`);

        try {
            // Create database tables if they don't exist
            await this.createTables();

            // Register event listener for message creation
            this.client.on('messageCreate', this.handleMessage.bind(this));

            Logger.module(`${this.name} module method loaded successfully`);
        } catch (error) {
            Logger.error(`Failed to load ${this.name} module: ${error.message}`);
            throw error;
        }
    }

    async unload() {
        try {
            // Remove event listeners
            this.client.removeListener('messageCreate', this.handleMessage.bind(this));
            Logger.module(`${this.name} module unloaded successfully`);
        } catch (error) {
            Logger.error(`Failed to unload ${this.name} module: ${error.message}`);
        }
    }

    async createTables() {
        try {
            const query = `
                CREATE TABLE IF NOT EXISTS xfixer_excluded_channels (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guild_id VARCHAR(20) NOT NULL,
                    channel_id VARCHAR(20) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_guild_channel (guild_id, channel_id)
                )
            `;

            await Database.execute(query);

            // Table for XFixer settings per guild
            const settingsQuery = `
                CREATE TABLE IF NOT EXISTS xfixer_settings (
                    guild_id VARCHAR(20) PRIMARY KEY,
                    delete_original BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `;

            await Database.execute(settingsQuery);
        } catch (error) {
            Logger.error(`Failed to create XFixer tables: ${error.message}`);
            throw error;
        }
    }

    async handleMessage(message) {
        try {
            // Ignore bot messages and system messages
            if (message.author.bot || message.system) return;

            // Check if this channel is excluded from X fixing
            const isExcluded = await this.isChannelExcluded(message.guild.id, message.channel.id);
            if (isExcluded) return;

            // Check if message contains X.com links
            const xLinkRegex = /https?:\/\/(www\.)?(x\.com|twitter\.com)\/[\w\/\?\=\&\.\-\%\#]+/gi;
            const matches = message.content.match(xLinkRegex);

            if (!matches || matches.length === 0) return;

            // Replace x.com/twitter.com with fixvx.com
            let fixedContent = message.content;
            let hasChanges = false;

            matches.forEach(link => {
                const fixedLink = this.fixXLink(link);
                if (fixedLink !== link) {
                    fixedContent = fixedContent.replace(link, fixedLink);
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                // Send the fixed message
                await message.channel.send({
                    content: `**Fixed links from ${message.author}:**\n${fixedContent}`,
                    allowedMentions: { parse: [] } // Prevent mentioning users in the fixed message
                });

                // Check if we should delete the original message
                const shouldDelete = await this.shouldDeleteOriginal(message.guild.id);
                if (shouldDelete) {
                    try {
                        await message.delete();
                        Logger.info(`Deleted original message with X.com links from ${message.author.tag} in #${message.channel.name}`);
                    } catch (deleteError) {
                        Logger.warn(`Could not delete original message: ${deleteError.message} (Missing permissions or message already deleted)`);
                    }
                }

                this.linksFixed++;
                Logger.info(`Fixed X.com links in message from ${message.author.tag} in #${message.channel.name}`);
            }

        } catch (error) {
            Logger.error(`Error handling message for X fixer: ${error.message}`);
        }
    }

    /**
     * Fix X.com/Twitter.com link to use fixvx.com
     * @param {string} link - Original X.com or Twitter.com link
     * @returns {string} - Fixed link using fixvx.com
     */
    fixXLink(link) {
        try {
            const url = new URL(link);

            // Only fix x.com and twitter.com domains
            if (url.hostname === 'x.com' || url.hostname === 'www.x.com' ||
                url.hostname === 'twitter.com' || url.hostname === 'www.twitter.com') {

                // Replace domain with fixvx.com
                url.hostname = 'fixvx.com';

                return url.toString();
            }

            return link;
        } catch (error) {
            Logger.error(`Error fixing X link: ${error.message}`);
            return link;
        }
    }

    /**
     * Check if a channel is excluded from X fixing
     */
    async isChannelExcluded(guildId, channelId) {
        try {
            const query = `
                SELECT COUNT(*) as count 
                FROM xfixer_excluded_channels 
                WHERE guild_id = ? AND channel_id = ?
            `;
            const rows = await Database.execute(query, [guildId, channelId]);
            return rows[0].count > 0;
        } catch (error) {
            Logger.error(`Failed to check excluded channel: ${error.message}`);
            return false;
        }
    }

    /**
     * Add a channel to the exclusion list
     */
    async excludeChannel(guildId, channelId) {
        try {
            const query = `
                INSERT INTO xfixer_excluded_channels (guild_id, channel_id)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id)
            `;
            await Database.execute(query, [guildId, channelId]);
            Logger.success(`Added channel ${channelId} to XFixer exclusion list`);
            return true;
        } catch (error) {
            Logger.error(`Failed to exclude channel: ${error.message}`);
            return false;
        }
    }

    /**
     * Remove a channel from the exclusion list
     */
    async includeChannel(guildId, channelId) {
        try {
            const query = `
                DELETE FROM xfixer_excluded_channels 
                WHERE guild_id = ? AND channel_id = ?
            `;
            const result = await Database.execute(query, [guildId, channelId]);
            Logger.success(`Removed channel ${channelId} from XFixer exclusion list`);
            return result.affectedRows > 0;
        } catch (error) {
            Logger.error(`Failed to include channel: ${error.message}`);
            return false;
        }
    }

    /**
     * Get all excluded channels for a guild
     */
    async getExcludedChannels(guildId) {
        try {
            const query = `
                SELECT channel_id, created_at 
                FROM xfixer_excluded_channels 
                WHERE guild_id = ?
                ORDER BY created_at DESC
            `;
            const rows = await Database.execute(query, [guildId]);
            return rows;
        } catch (error) {
            Logger.error(`Failed to get excluded channels: ${error.message}`);
            return [];
        }
    }

    /**
     * Check if original messages should be deleted for this guild
     */
    async shouldDeleteOriginal(guildId) {
        try {
            const query = `
                SELECT delete_original 
                FROM xfixer_settings 
                WHERE guild_id = ?
            `;
            const rows = await Database.execute(query, [guildId]);

            // Default to true if no setting exists
            return rows.length > 0 ? rows[0].delete_original : true;
        } catch (error) {
            Logger.error(`Failed to get delete setting: ${error.message}`);
            return true; // Default to deleting
        }
    }

    /**
     * Set whether to delete original messages for this guild
     */
    async setDeleteOriginal(guildId, shouldDelete) {
        try {
            const query = `
                INSERT INTO xfixer_settings (guild_id, delete_original)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE 
                delete_original = VALUES(delete_original),
                updated_at = CURRENT_TIMESTAMP
            `;
            await Database.execute(query, [guildId, shouldDelete]);
            Logger.success(`Updated delete setting for guild ${guildId}: ${shouldDelete}`);
            return true;
        } catch (error) {
            Logger.error(`Failed to set delete setting: ${error.message}`);
            return false;
        }
    }

    /**
     * Get guild settings
     */
    async getGuildSettings(guildId) {
        try {
            const query = `
                SELECT * FROM xfixer_settings 
                WHERE guild_id = ?
            `;
            const rows = await Database.execute(query, [guildId]);

            if (rows.length > 0) {
                return rows[0];
            }

            // Return default settings
            return {
                guild_id: guildId,
                delete_original: true,
                created_at: null,
                updated_at: null
            };
        } catch (error) {
            Logger.error(`Failed to get guild settings: ${error.message}`);
            return {
                guild_id: guildId,
                delete_original: true,
                created_at: null,
                updated_at: null
            };
        }
    }

    getModuleInfo() {
        return {
            name: this.name,
            description: this.description,
            version: this.version,
            enabled: this.enabled,
            commands: ['exclude', 'include', 'list', 'settings'],
            events: ['messageCreate'],
            stats: {
                linksFixed: this.linksFixed || 0
            }
        };
    }

    async healthCheck() {
        try {
            // Simple health check - ensure we can create URL objects
            new URL('https://x.com/test');

            // Check database connection
            await Database.execute('SELECT 1');

            // Check if tables exist
            const tables = await Database.execute(`
                SELECT COUNT(*) as count 
                FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name IN ('xfixer_excluded_channels', 'xfixer_settings')
            `);

            return {
                status: 'healthy',
                healthy: true,
                service: 'running',
                database: 'connected',
                tables: tables[0].count >= 2 ? 'exists' : 'missing',
                stats: {
                    linksFixed: this.linksFixed
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                healthy: false,
                error: error.message
            };
        }
    }
}

module.exports = XFixerModule;
