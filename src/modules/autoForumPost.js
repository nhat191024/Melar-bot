const Logger = require('../utils/Logger');
const Database = require('../utils/Database');
const LinkFixer = require('../utils/LinkFixer');

class AutoForumPostModule {
    constructor(client) {
        this.client = client;
        this.name = 'AutoForumPost';
        this.description = 'Automated forum posting features';
        this.enabled = true;
        this.version = '2.0.0';
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
            this.client.removeListener('messageCreate', this.handleMessage.bind(this));
            // Note: messageReactionAdd is handled by the event handler, no need to remove here
            Logger.module(`${this.name} module unloaded successfully`);
        } catch (error) {
            Logger.error(`Failed to unload ${this.name} module: ${error.message}`);
        }
    }

    async createTables() {
        try {
            const query = `
                CREATE TABLE IF NOT EXISTS auto_forum_settings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guild_id VARCHAR(20) NOT NULL,
                    channel_id VARCHAR(20) NOT NULL,
                    forum_id VARCHAR(20) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_guild_channel (guild_id, channel_id)
                )
            `;

            await Database.execute(query);

            // Table to track sent messages for deletion
            const messageTrackingQuery = `
                CREATE TABLE IF NOT EXISTS auto_forum_messages (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    guild_id VARCHAR(20) NOT NULL,
                    original_message_id VARCHAR(20) NOT NULL,
                    forum_message_id VARCHAR(20) NOT NULL,
                    thread_id VARCHAR(20) NOT NULL,
                    user_id VARCHAR(20) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_original_message (original_message_id),
                    INDEX idx_user_messages (user_id)
                )
            `;

            await Database.execute(messageTrackingQuery);

            // Table for AutoForumPost settings per guild
            const settingsQuery = `
                CREATE TABLE IF NOT EXISTS auto_forum_guild_settings (
                    guild_id VARCHAR(20) PRIMARY KEY,
                    filter_hashtag_only BOOLEAN DEFAULT true,
                    min_content_length INT DEFAULT 3,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `;

            await Database.execute(settingsQuery);
        } catch (error) {
            Logger.error(`Failed to create AutoForumPost tables: ${error.message}`);
            throw error;
        }
    }

    async handleMessage(message) {
        try {
            // Ignore bot messages and system messages
            if (message.author.bot || message.system) return;

            // Check if this channel has auto forum posting enabled
            const settings = await this.getChannelSettings(message.guild.id, message.channel.id);

            if (!settings) return;

            // Send message to forum
            await this.sendToForum(message, settings);

        } catch (error) {
            Logger.error(`Error handling message for auto forum post: ${error.message}`);
        }
    }

    async getChannelSettings(guildId, channelId) {
        try {
            const query = `
                SELECT * FROM auto_forum_settings 
                WHERE guild_id = ? AND channel_id = ?
            `;
            const rows = await Database.execute(query, [guildId, channelId]);

            if (rows && rows.length > 0) {
                return rows[0];
            }

            return null;
        } catch (error) {
            Logger.error(`Failed to get channel settings: ${error.message}`);
            return null;
        }
    }

    async sendToForum(message, settings) {
        try {
            const guild = message.guild;
            const forumChannel = guild.channels.cache.get(settings.forum_id);

            if (!forumChannel) {
                Logger.warn(`Forum channel ${settings.forum_id} not found`);
                return;
            }

            // Extract hashtags from message content
            const hashtags = this.extractHashtags(message.content);

            if (hashtags.length === 0) {
                Logger.info('No hashtags found in message, skipping forum post');
                return;
            }

            // Get guild settings for content filtering
            const guildSettings = await this.getGuildFilterSettings(message.guild.id);

            // Check if message has meaningful content beyond hashtags (if filtering is enabled)
            if (guildSettings.filter_hashtag_only) {
                if (!this.hasContentBeyondHashtags(message.content, guildSettings.min_content_length) &&
                    message.attachments.size === 0 &&
                    message.embeds.length === 0) {
                    Logger.info('Message contains only hashtags without meaningful content, skipping forum post');
                    return;
                }
            }

            // Find matching forum post for each hashtag
            for (const hashtag of hashtags) {
                const targetThread = await this.findMatchingThread(forumChannel, hashtag);

                if (targetThread) {
                    // Fix X.com links in content
                    const fixedContent = LinkFixer.fixXLinks(message.content);

                    // Send message to the thread
                    const sentMessage = await targetThread.send({
                        content: `💬 **Từ ${message.author}:**\n\n${fixedContent}`,
                        files: Array.from(message.attachments.values())
                    });

                    // Track the message for potential deletion
                    await this.trackMessage(message, sentMessage, targetThread);

                    // React to original message to show it was processed
                    await message.react('📤');

                    // Send confirmation in source channel
                    const confirmMessage = await message.reply({
                        content: `✅ Tin nhắn đã được gửi vào post **${targetThread.name}** - Nhấn 🗑️ để xóa`
                    });

                    // Add delete reaction to confirmation message
                    await confirmMessage.react('🗑️');

                    // Store the message mapping for easier tracking
                    this.confirmMessageMap = this.confirmMessageMap || new Map();
                    this.confirmMessageMap.set(confirmMessage.id, {
                        originalMessageId: message.id,
                        userId: message.author.id,
                        threadName: targetThread.name
                    });

                    // Clean up mapping after 1 hour
                    setTimeout(() => {
                        if (this.confirmMessageMap) {
                            this.confirmMessageMap.delete(confirmMessage.id);
                        }
                    }, 3600000); // 1 hour

                    Logger.success(`Sent message to thread: ${targetThread.name}`);
                } else {
                    Logger.info(`No matching thread found for hashtag: ${hashtag}`);
                }
            }

        } catch (error) {
            Logger.error(`Failed to send to forum: ${error.message}`);
        }
    }

    /**
     * Extract hashtags from message content
     */
    extractHashtags(content) {
        if (!content) return [];

        const hashtagPattern = /#\w+/g;
        const matches = content.match(hashtagPattern);

        return matches ? matches.map(tag => tag.toLowerCase()) : [];
    }

    /**
     * Check if message contains meaningful content beyond hashtags
     */
    hasContentBeyondHashtags(content, minLength = 3) {
        if (!content) return false;

        // Remove all hashtags from content
        const contentWithoutHashtags = content.replace(/#\w+/g, '').trim();

        // Remove extra whitespace and check if there's meaningful content left
        const cleanContent = contentWithoutHashtags.replace(/\s+/g, ' ').trim();

        // Consider content meaningful if it has at least minLength characters after removing hashtags
        return cleanContent.length >= minLength;
    }

    /**
     * Get guild filter settings
     */
    async getGuildFilterSettings(guildId) {
        try {
            const query = `
                SELECT * FROM auto_forum_guild_settings 
                WHERE guild_id = ?
            `;
            const rows = await Database.execute(query, [guildId]);

            if (rows.length > 0) {
                return rows[0];
            }

            // Return default settings
            return {
                guild_id: guildId,
                filter_hashtag_only: true,
                min_content_length: 3,
                created_at: null,
                updated_at: null
            };
        } catch (error) {
            Logger.error(`Failed to get guild filter settings: ${error.message}`);
            return {
                guild_id: guildId,
                filter_hashtag_only: true,
                min_content_length: 3,
                created_at: null,
                updated_at: null
            };
        }
    }

    /**
     * Update guild filter settings
     */
    async updateGuildFilterSettings(guildId, filterHashtagOnly, minContentLength) {
        try {
            const query = `
                INSERT INTO auto_forum_guild_settings (guild_id, filter_hashtag_only, min_content_length)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                filter_hashtag_only = VALUES(filter_hashtag_only),
                min_content_length = VALUES(min_content_length),
                updated_at = CURRENT_TIMESTAMP
            `;
            await Database.execute(query, [guildId, filterHashtagOnly, minContentLength]);
            Logger.success(`Updated guild filter settings for guild ${guildId}`);
            return true;
        } catch (error) {
            Logger.error(`Failed to update guild filter settings: ${error.message}`);
            return false;
        }
    }

    /**
     * Find matching thread in forum based on hashtag
     */
    async findMatchingThread(forumChannel, hashtag) {
        try {
            // Remove # from hashtag for comparison
            const cleanHashtag = hashtag.replace('#', '').toLowerCase();

            // Fetch active threads
            const threads = await forumChannel.threads.fetchActive();

            // Search in active threads
            for (const [id, thread] of threads.threads) {
                const threadName = thread.name.toLowerCase();
                if (threadName.includes(cleanHashtag)) {
                    return thread;
                }
            }

            // Also search in archived threads if not found in active
            const archivedThreads = await forumChannel.threads.fetchArchived();
            for (const [id, thread] of archivedThreads.threads) {
                const threadName = thread.name.toLowerCase();
                if (threadName.includes(cleanHashtag)) {
                    return thread;
                }
            }

            return null;
        } catch (error) {
            Logger.error(`Error finding matching thread: ${error.message}`);
            return null;
        }
    }

    /**
     * Track sent message for potential deletion
     */
    async trackMessage(originalMessage, forumMessage, thread) {
        try {
            const query = `
                INSERT INTO auto_forum_messages 
                (guild_id, original_message_id, forum_message_id, thread_id, user_id)
                VALUES (?, ?, ?, ?, ?)
            `;

            await Database.execute(query, [
                originalMessage.guild.id,
                originalMessage.id,
                forumMessage.id,
                thread.id,
                originalMessage.author.id
            ]);

        } catch (error) {
            Logger.error(`Failed to track message: ${error.message}`);
        }
    }

    /**
     * Handle reaction events for message deletion
     */
    async handleReaction(reaction, user) {
        try {
            Logger.info(`User ${user.tag} (${user.id}) reacted with ${reaction.emoji.name} on message ${reaction.message.id}`);

            // Ignore bot reactions
            if (user.bot) {
                console.log('Ignoring bot reaction');
                return;
            }

            // Fetch the reaction if it's partial
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                } catch (error) {
                    console.log('Failed to fetch reaction:', error);
                    return;
                }
            }

            // Check if it's a delete reaction (🗑️)
            if (reaction.emoji.name === '🗑️') {
                const message = reaction.message;
                console.log('Delete reaction detected on message:', message.content?.substring(0, 50) + '...');

                // Check if this is a confirmation message using our mapping
                const messageMapping = this.confirmMessageMap?.get(message.id);
                const isConfirmationMessage = messageMapping ||
                    (message.content && message.content.includes('✅ Tin nhắn đã được gửi vào post'));

                if (isConfirmationMessage) {
                    await this.handleMessageDeletion(message, user);
                } else {
                    Logger.warn('Message is not a confirmation message, ignoring');
                }
            } else {
                Logger.warn(`Reaction ${reaction.emoji.name} is not a delete reaction, ignoring`);
            }
        } catch (error) {
            Logger.error(`Error handling reaction: ${error.message}`);
            Logger.error('Full error details:', error);
        }
    }

    /**
     * Handle message deletion request
     */
    async handleMessageDeletion(confirmMessage, user) {
        try {
            // Find the original message that triggered this confirmation
            let originalMessage = null;

            // First try to use our mapping
            const messageMapping = this.confirmMessageMap?.get(confirmMessage.id);
            if (messageMapping) {
                try {
                    originalMessage = await confirmMessage.channel.messages.fetch(messageMapping.originalMessageId);
                } catch (error) {
                    Logger.error('Failed to fetch original message via mapping:', error.message);
                }
            }

            // Fallback to reference method
            if (!originalMessage && confirmMessage.reference?.messageId) {
                try {
                    originalMessage = await confirmMessage.channel.messages.fetch(confirmMessage.reference.messageId);
                } catch (error) {
                    Logger.error('Failed to fetch original message via reference:', error.message);
                }
            }

            if (!originalMessage) {
                Logger.warn('Could not find original message for deletion');
                await confirmMessage.react('❌');
                return;
            }

            // Get member object for permission checking
            const member = confirmMessage.guild.members.cache.get(user.id);
            if (!member) {
                console.log('Could not find member object for user:', user.tag);
                await confirmMessage.react('❌');
                return;
            }

            // Check permissions: original author or ManageMessages permission
            const canDelete = user.id === originalMessage.author.id ||
                member.permissions.has('ManageMessages') ||
                member.permissions.has('Administrator');

            if (!canDelete) {
                await confirmMessage.reply({
                    content: '❌ Bạn chỉ có thể xóa tin nhắn của chính mình hoặc cần quyền Manage Messages.',
                });
                return;
            }

            // Find and delete forum messages
            const deletedCount = await this.deleteForumMessages(originalMessage.id);

            if (deletedCount > 0) {
                await confirmMessage.edit({
                    content: `🗑️ Đã xóa ${deletedCount} tin nhắn khỏi forum posts.`
                });

                // Clean up the mapping
                if (this.confirmMessageMap) {
                    this.confirmMessageMap.delete(confirmMessage.id);
                }

                // Delete the confirmation message after a delay
                setTimeout(() => {
                    confirmMessage.delete().catch((error) => {
                        console.log('Failed to delete confirmation message:', error.message);
                    });
                }, 5000);

                Logger.success(`Successfully deleted ${deletedCount} forum messages`);
            } else {
                await confirmMessage.reply({
                    content: '❌ Không tìm thấy tin nhắn để xóa.',
                });
                Logger.error('No forum messages found to delete');
            }

        } catch (error) {
            Logger.error(`Error handling message deletion: ${error.message}`);
            console.error('Full error details:', error);
        }
    }

    /**
     * Delete forum messages and remove from tracking
     */
    async deleteForumMessages(originalMessageId) {
        try {
            // Get tracked messages
            const query = `
                SELECT forum_message_id, thread_id 
                FROM auto_forum_messages 
                WHERE original_message_id = ?
            `;
            const trackedMessages = await Database.execute(query, [originalMessageId]);

            let deletedCount = 0;

            for (const tracked of trackedMessages) {
                try {
                    // Find the thread and delete the message
                    const thread = await this.client.channels.fetch(tracked.thread_id);
                    if (thread) {
                        const forumMessage = await thread.messages.fetch(tracked.forum_message_id);
                        if (forumMessage) {
                            await forumMessage.delete();
                            deletedCount++;
                        }
                    }
                } catch (error) {
                    Logger.error(`Failed to delete forum message ${tracked.forum_message_id}: ${error.message}`);
                }
            }

            // Remove from tracking database
            const deleteQuery = `
                DELETE FROM auto_forum_messages 
                WHERE original_message_id = ?
            `;
            await Database.execute(deleteQuery, [originalMessageId]);

            return deletedCount;
        } catch (error) {
            Logger.error(`Error deleting forum messages: ${error.message}`);
            return 0;
        }
    }

    async saveSettings(guildId, channelId, forumId) {
        try {
            const query = `
                INSERT INTO auto_forum_settings (guild_id, channel_id, forum_id)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                forum_id = VALUES(forum_id)
            `;

            await Database.execute(query, [guildId, channelId, forumId]);
            Logger.success(`Saved auto forum settings for guild ${guildId}`);
            return true;
        } catch (error) {
            Logger.error(`Failed to save auto forum settings: ${error.message}`);
            return false;
        }
    }

    async removeSettings(guildId, channelId) {
        try {
            const query = `
                DELETE FROM auto_forum_settings 
                WHERE guild_id = ? AND channel_id = ?
            `;

            const result = await Database.execute(query, [guildId, channelId]);
            Logger.success(`Removed auto forum settings for guild ${guildId}, channel ${channelId}`);
            return result.affectedRows > 0;
        } catch (error) {
            Logger.error(`Failed to remove auto forum settings: ${error.message}`);
            return false;
        }
    }

    async getGuildSettings(guildId) {
        try {
            const query = `
                SELECT * FROM auto_forum_settings 
                WHERE guild_id = ?
                ORDER BY created_at DESC
            `;
            const rows = await Database.execute(query, [guildId]);

            return rows;
        } catch (error) {
            Logger.error(`Failed to get guild settings: ${error.message}`);
            return [];
        }
    }

    getModuleInfo() {
        return {
            name: this.name,
            description: this.description,
            version: this.version,
            enabled: this.enabled,
            commands: ['setup', 'remove', 'list', 'filter-settings'],
            events: ['messageCreate', 'messageReactionAdd']
        };
    }

    async healthCheck() {
        try {
            // Check database connection
            await Database.execute('SELECT 1');

            // Check if tables exist
            const tables = await Database.execute(`
                SELECT COUNT(*) as count 
                FROM information_schema.tables 
                WHERE table_schema = DATABASE() 
                AND table_name IN ('auto_forum_settings', 'auto_forum_messages', 'auto_forum_guild_settings')
            `);

            return {
                status: 'healthy',
                database: 'connected',
                tables: tables[0].count >= 3 ? 'exists' : 'missing'
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }
}

module.exports = AutoForumPostModule;