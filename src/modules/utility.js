const Logger = require('../utils/Logger');
const Database = require('../utils/Database');
const NodeCron = require('../utils/NodeCron');

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
        await this.setupNoteReminders();

        Logger.module(`${this.name} module method loaded successfully`);
    }

    async unload() {
        try {
            // Cleanup cron job when unloading module
            await this.cleanupExistingNoteReminderJob();

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
            const notesQuery = `
                    CREATE TABLE IF NOT EXISTS notes (
                        id INT AUTO_INCREMENT PRIMARY KEY,  
                        user_id VARCHAR(20) NOT NULL,
                        content TEXT NOT NULL,
                        deadline DATETIME NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_user_note (user_id, id)
                    )
                `;

            await Database.execute(notesQuery);

            // Create table to track sent reminders
            const remindersQuery = `
                CREATE TABLE IF NOT EXISTS note_reminders (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    note_id INT NOT NULL,
                    user_id VARCHAR(20) NOT NULL,
                    reminder_type ENUM('2weeks', '1week', '3days', '1day', '1hour') NOT NULL,
                    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY unique_reminder (note_id, reminder_type),
                    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
                )
            `;

            await Database.execute(remindersQuery);

        } catch (error) {
            Logger.error(`Failed to create notes table: ${error.message}`);
            throw error;
        }
    }

    /**
     *  Create a new note for a user
     * @param {string} userId - The ID of the user
     * @param {string} content - The content of the note
     * @param {Date|null} deadline - The deadline for the note (optional)
     */
    async createNote(userId, content, deadline = null) {
        try {
            const query = `
                INSERT INTO notes (user_id, content, deadline)
                VALUES (?, ?, ?)
            `;
            const id = await Database.execute(query, [userId, content, deadline]).then(result => result.insertId);
            Logger.info(`Note created for user ${userId}${deadline ? ' with deadline' : ''}`);
            return id;
        } catch (error) {
            Logger.error(`Failed to create note: ${error.message}`);
            throw error;
        }
    }

    /**
     *  Get notes for a user (sorted with deadline notes first)
     */
    async getNotes(userId) {
        try {
            const query = `
                SELECT * FROM notes 
                WHERE user_id = ? 
                ORDER BY 
                    CASE WHEN deadline IS NOT NULL THEN 0 ELSE 1 END,
                    deadline ASC,
                    created_at DESC
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

    /**
     * Remove multiple notes from user
     */
    async removeMultipleNotes(userId, noteIds) {
        try {
            if (!noteIds || noteIds.length === 0) return 0;

            const placeholders = noteIds.map(() => '?').join(',');
            const query = `
                DELETE FROM notes 
                WHERE user_id = ? AND id IN (${placeholders})
            `;
            const params = [userId, ...noteIds];
            const result = await Database.execute(query, params);
            return result.affectedRows;
        } catch (error) {
            Logger.error(`Failed to remove multiple notes: ${error.message}`);
            throw error;
        }
    }

    /**
     * Parse date and time strings into a Date object
     * @param {string|null} dateString - Date in DD/MM/YYYY format
     * @param {string|null} timeString - Time in HH:MM format
     * @returns {Date|null} - Parsed date or null if no date provided
     */
    parseDeadline(dateString, timeString) {
        try {
            const VietnamTime = require('../utils/VietnamTime');

            if (!dateString && !timeString) return null;

            let vietnamMoment;

            if (dateString) {
                // Parse DD/MM/YYYY or DD/MM format
                const dateParts = dateString.split('/');
                if (dateParts.length === 2) {
                    // DD/MM format - use current year
                    const day = parseInt(dateParts[0]);
                    const month = parseInt(dateParts[1]);
                    const year = new Date().getFullYear();
                    vietnamMoment = VietnamTime.now().year(year).month(month - 1).date(day);
                } else if (dateParts.length === 3) {
                    // DD/MM/YYYY format
                    const day = parseInt(dateParts[0]);
                    const month = parseInt(dateParts[1]);
                    const year = parseInt(dateParts[2]);
                    vietnamMoment = VietnamTime.now().year(year).month(month - 1).date(day);
                } else {
                    throw new Error('Invalid date format');
                }
            } else {
                // Only time provided, use today
                vietnamMoment = VietnamTime.now();
            }

            if (timeString) {
                // Parse HH:MM format
                const timeParts = timeString.split(':');
                if (timeParts.length === 2) {
                    const hours = parseInt(timeParts[0]);
                    const minutes = parseInt(timeParts[1]);
                    vietnamMoment.hours(hours).minutes(minutes).seconds(0).milliseconds(0);
                } else {
                    throw new Error('Invalid time format');
                }
            } else if (dateString) {
                // If only date is provided, set time to 23:00
                vietnamMoment.hours(23).minutes(0).seconds(0).milliseconds(0);
            }

            // Convert to JavaScript Date object
            return VietnamTime.toDate(vietnamMoment);

        } catch (error) {
            Logger.error(`Failed to parse deadline: ${error.message}`);
            return null;
        }
    }

    /**
     * Get notes that need reminders
     * @returns {Array} - Array of notes with their reminder types
     */
    async getNotesForReminder() {
        try {
            const VietnamTime = require('../utils/VietnamTime');
            const vietnamNow = VietnamTime.now();

            // Calculate reminder thresholds
            const oneHour = VietnamTime.toDate(vietnamNow.clone().add(1, 'hour'));
            const oneDay = VietnamTime.toDate(vietnamNow.clone().add(1, 'day'));
            const threeDays = VietnamTime.toDate(vietnamNow.clone().add(3, 'days'));
            const oneWeek = VietnamTime.toDate(vietnamNow.clone().add(1, 'week'));
            const twoWeeks = VietnamTime.toDate(vietnamNow.clone().add(2, 'weeks'));
            const currentTime = VietnamTime.toDate(vietnamNow);

            const query = `
                SELECT n.*, 
                    CASE 
                        WHEN n.deadline <= ? THEN '1hour'
                        WHEN n.deadline <= ? THEN '1day'
                        WHEN n.deadline <= ? THEN '3days'
                        WHEN n.deadline <= ? THEN '1week'
                        WHEN n.deadline <= ? THEN '2weeks'
                        ELSE NULL
                    END as reminder_type
                FROM notes n
                LEFT JOIN note_reminders nr ON (
                    n.id = nr.note_id 
                    AND nr.reminder_type = CASE 
                        WHEN n.deadline <= ? THEN '1hour'
                        WHEN n.deadline <= ? THEN '1day'
                        WHEN n.deadline <= ? THEN '3days'
                        WHEN n.deadline <= ? THEN '1week'
                        WHEN n.deadline <= ? THEN '2weeks'
                        ELSE NULL
                    END
                )
                WHERE n.deadline IS NOT NULL 
                AND n.deadline > ?
                AND nr.id IS NULL
                AND (
                    n.deadline <= ? OR
                    n.deadline <= ? OR
                    n.deadline <= ? OR
                    n.deadline <= ? OR
                    n.deadline <= ?
                )
                ORDER BY n.deadline ASC
            `;

            const params = [
                oneHour, oneDay, threeDays, oneWeek, twoWeeks,
                oneHour, oneDay, threeDays, oneWeek, twoWeeks,
                currentTime,
                oneHour, oneDay, threeDays, oneWeek, twoWeeks
            ];

            const results = await Database.execute(query, params);
            return results.filter(note => note.reminder_type !== null);
        } catch (error) {
            Logger.error(`Failed to get notes for reminder: ${error.message}`);
            throw error;
        }
    }

    /**
     * Format deadline for display in Vietnamese
     */
    formatDeadlineVietnamese(deadline) {
        if (!deadline) return null;

        try {
            const VietnamTime = require('../utils/VietnamTime');
            const momentObj = VietnamTime.create(deadline);

            if (!momentObj.isValid()) return null;

            return VietnamTime.formatVN(momentObj).fullDisplay;
        } catch (error) {
            return null;
        }
    }

    /**
     * Setup note reminder cron job
     */
    async setupNoteReminders() {
        try {
            // Check if job already exists and delete it first
            await this.cleanupExistingNoteReminderJob();

            // Check for note reminders every hour
            const jobConfig = {
                name: 'noteReminders',
                description: 'Kiểm tra và gửi nhắc nhở ghi chú',
                cronExpression: '0 * * * *',
                functionName: 'sendNoteReminders',
                moduleName: 'utility',
                enabled: true
            };

            await NodeCron.createCronJob(jobConfig);

            Logger.info('Note reminders cron job setup successfully');
        } catch (error) {
            Logger.error(`Failed to setup note reminders: ${error.message}`);
        }
    }

    /**
     * Cleanup existing note reminder job to avoid duplicates
     */
    async cleanupExistingNoteReminderJob() {
        try {
            // Delete existing job if it exists
            const deleteQuery = 'DELETE FROM cron_jobs WHERE name = ?';
            await Database.execute(deleteQuery, ['noteReminders']);
            Logger.debug('Cleaned up existing noteReminders cron job');
        } catch (error) {
            // Ignore error if job doesn't exist
            Logger.debug(`No existing noteReminders job to cleanup: ${error.message}`);
        }
    }

    /**
     * Send note reminders to users
     */
    async sendNoteReminders() {
        try {
            const notesToRemind = await this.getNotesForReminder();

            if (notesToRemind.length === 0) {
                return;
            }

            Logger.info(`Found ${notesToRemind.length} notes requiring reminders`);

            for (const note of notesToRemind) {
                try {
                    const user = await this.client.users.fetch(note.user_id);
                    if (!user) continue;

                    const deadlineText = this.formatDeadlineVietnamese(note.deadline);
                    const reminderTypeText = this.getReminderTypeText(note.reminder_type);

                    const reminderMessage = `🔔 **Nhắc nhở ghi chú**\n\n` +
                        `📝 **Ghi chú #${note.id}:** ${note.content}\n` +
                        `⏰ **Hạn chót:** ${deadlineText}\n` +
                        `⚠️ **Thời gian còn lại:** ${reminderTypeText}\n\n` +
                        `💡 Sử dụng \`/note_list\` để xem tất cả ghi chú của bạn.\n` +
                        `🗑️ Sử dụng \`/note_remove ids:${note.id}\` để xóa ghi chú này nếu đã hoàn thành.`;

                    await user.send(reminderMessage);

                    // Mark reminder as sent
                    await this.markReminderSent(note.id, note.user_id, note.reminder_type);

                    Logger.info(`Sent note reminder for note #${note.id} to user ${user.tag}`);

                } catch (dmError) {
                    Logger.warn(`Failed to send note reminder to user ${note.user_id}: ${dmError.message}`);
                }
            }

        } catch (error) {
            Logger.error(`Failed to send note reminders: ${error.message}`);
        }
    }

    /**
     * Mark a reminder as sent
     */
    async markReminderSent(noteId, userId, reminderType) {
        try {
            const query = `
                INSERT IGNORE INTO note_reminders (note_id, user_id, reminder_type)
                VALUES (?, ?, ?)
            `;
            await Database.execute(query, [noteId, userId, reminderType]);
        } catch (error) {
            Logger.error(`Failed to mark reminder as sent: ${error.message}`);
        }
    }

    /**
     * Get reminder type text in Vietnamese
     */
    getReminderTypeText(reminderType) {
        const reminderTexts = {
            '1hour': 'Còn 1 tiếng',
            '1day': 'Còn 1 ngày',
            '3days': 'Còn 3 ngày',
            '1week': 'Còn 1 tuần',
            '2weeks': 'Còn 2 tuần'
        };
        return reminderTexts[reminderType] || 'Sắp đến hạn';
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
