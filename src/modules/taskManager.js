const { ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Logger = require('../utils/Logger');
const Database = require('../utils/Database');
const NodeCron = require('../utils/NodeCron');
const VietnamTime = require('../utils/VietnamTime');

class TaskManagerModule {
    constructor(client) {
        this.client = client;
        this.name = 'TaskManager';
        this.description = 'Hệ thống quản lý và giao nhiệm vụ cho người dùng';
        this.enabled = true;
        this.version = '1.0.0';
    }

    async load() {
        Logger.loading(`Loading ${this.name} module v${this.version}...`);

        try {
            await this.createTables();

            // Schedule overdue task checker to run every hour
            try {
                const existingJob = await Database.execute(
                    'SELECT id FROM cron_jobs WHERE name = ?',
                    ['overdue-task-checker']
                );

                if (existingJob.length === 0) {
                    await NodeCron.createCronJob({
                        name: 'overdue-task-checker',
                        description: 'Check for overdue tasks and update their status',
                        cronExpression: '0 * * * *', // Every hour at minute 0
                        functionName: 'checkAndUpdateOverdueTasks',
                        moduleName: 'taskManager'
                    });
                    Logger.info('✅ Overdue task checker scheduled successfully');
                } else {
                    Logger.info('✅ Overdue task checker already exists');
                }
            } catch (cronError) {
                Logger.warn(`⚠️ Failed to schedule overdue task checker: ${cronError.message}`);
            }

            Logger.module(`${this.name} module method loaded successfully`);
        } catch (error) {
            Logger.error(`Failed to load ${this.name} module: ${error.message}`);
            throw error;
        }
    }

    async unload() {
        try {
            //
            Logger.module(`${this.name} module unloaded successfully`);
        } catch (error) {
            Logger.error(`Failed to unload ${this.name} module: ${error.message}`);
        }
    }

    async createTables() {
        try {
            // Table to store tasks
            const taskTable = `
                CREATE TABLE IF NOT EXISTS tasks (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    description TEXT NULL,
                    link VARCHAR(255) NULL,
                    created_by_user_id VARCHAR(30) NOT NULL,
                    status ENUM('pending', 'in_progress', 'completed', 'canceled', 'overdue') NOT NULL DEFAULT 'in_progress',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                );
            `;

            await Database.execute(taskTable);

            // Table to track sent messages for deletion
            const userTable = `
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    role ENUM('pm', 'member') NOT NULL DEFAULT 'member'
                );
            `;

            await Database.execute(userTable);

            // Table to assign tasks to users with deadlines and completion status
            const taskAssignmentsTable = `
                CREATE TABLE IF NOT EXISTS task_assignments (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    task_id INT NOT NULL,
                    user_id VARCHAR(30) NOT NULL,
                    deadline DATETIME NULL,
                    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
                );
            `;

            await Database.execute(taskAssignmentsTable);

            // Table to store last completed task for undo functionality
            const lastCompletedTable = `
                CREATE TABLE IF NOT EXISTS last_completed_tasks (
                    user_id VARCHAR(30) PRIMARY KEY,
                    task_id INT NOT NULL,
                    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `;

            await Database.execute(lastCompletedTable);
        } catch (error) {
            Logger.error(`Failed to create task assignment tables: ${error.message}`);
            throw error;
        }
    }

    /**
     *  Create a new task for a user
        * @param {string} title - The title of the task
        * @param {string} userId - The ID of the user
        * @param {string} description - The description of the task (optional)
        * @param {string} link - The link related to the task (optional)
        * @param {string} time - The deadline time for the task (HH:MM) (optional)
        * @param {string} date - The deadline date for the task (DD-MM-YYYY) (optional)
     */
    async createTask(title, userIds, createdBy, description = null, link = null, time = null, date = null, createdAtChannel = null) {
        try {
            const query = `
                    INSERT INTO tasks (title, description, link, created_by_user_id)
                    VALUES (?, ?, ?, ?)
                `;
            const taskId = await Database.execute(query, [title, description, link, createdBy]).then(result => result.insertId);
            Logger.info(`Task created with ID ${taskId}`);

            const deadline = (time && date) ? VietnamTime.parseDate(date).hours(parseInt(time.split(':')[0], 10)).minutes(parseInt(time.split(':')[1], 10)).seconds(0).milliseconds(0).toDate()
                : (date ? VietnamTime.parseDate(date).hours(23).minutes(59).seconds(59).milliseconds(0).toDate()
                    : (time ? VietnamTime.nextOccurrenceOf(time).toDate() : null));

            for (const userId of userIds) {
                const assignmentQuery = `
                        INSERT INTO task_assignments (task_id, user_id, deadline)
                        VALUES (?, ?, ?)
                    `;
                await Database.execute(assignmentQuery, [taskId, userId, deadline]);
                Logger.info(`Task ${taskId} assigned to user ${userId} with deadline ${deadline}`);
            }

            let remindType = '';

            // Schedule a reminder 23 hours before the deadline if time & date is not provided
            if (!time && !date) {
                const reminderTime = VietnamTime.defaultReminderTime();

                remindType = '23Auto'

                await NodeCron.createOneTimeJob({
                    name: `task-reminder-${taskId}`,
                    description: `Reminder for task: ${title}`,
                    scheduledTime: reminderTime,
                    functionName: 'sendTaskReminder',
                    moduleName: 'taskManager',
                    functionParams: { taskId, userIds, remindType, createdAtChannel }
                });
            }

            // If date is provided, set reminder for 14, 7, 3 days before
            if (date) {
                const daysUntilDeadline = VietnamTime.daysUntil(date);
                const reminderDates = VietnamTime.createReminderDates(date, [14, 7, 3]);

                for (const reminderDate of reminderDates) {
                    remindType = `${reminderDate}Day`
                    await NodeCron.createOneTimeJob({
                        name: `task-reminder-${taskId}-${reminderDate.valueOf()}`,
                        description: `Reminder for task: ${title}`,
                        scheduledTime: VietnamTime.toDate(reminderDate),
                        functionName: 'sendTaskReminder',
                        moduleName: 'taskManager',
                        functionParams: { taskId, userIds, remindType, createdAtChannel }
                    });
                }

                Logger.info(`Created ${reminderDates.length} reminder(s) for task ${taskId} with deadline ${date}`);
            }

            if (time) {
                // Calculate time until deadline using VietnamTime helper
                const timeUntilDeadline = VietnamTime.nextOccurrenceOf(time);

                // Schedule reminder 1 hour before the deadline
                const reminderTime = timeUntilDeadline.subtract(1, 'hour');

                Logger.info(`Scheduling task reminder for: ${VietnamTime.formatVN(reminderTime).fullDisplay} (1 hour before deadline)`);

                // Convert to native Date object for scheduling
                const scheduledDate = VietnamTime.toDate(reminderTime);

                remindType = 'TimeOnly';

                await NodeCron.createOneTimeJob({
                    name: `task-reminder-${taskId}-${scheduledDate.getTime()}`,
                    description: `Reminder for task: ${title}`,
                    scheduledTime: scheduledDate,
                    functionName: 'sendTaskReminder',
                    moduleName: 'taskManager',
                    functionParams: { taskId, userIds, remindType, createdAtChannel }
                });
            }

            return true;

        } catch (error) {
            Logger.error(`Failed to create task: ${error.message}`);
            throw error;
        }
    }

    /**
        *  Get all tasks listed in the database & user assignments
        * @returns {Array} - An array of task objects
     */
    async getAllTasks(status) {
        try {
            const query = `
                SELECT tasks.*, task_assignments.user_id, task_assignments.deadline
                FROM tasks
                LEFT JOIN task_assignments ON tasks.id = task_assignments.task_id
                WHERE tasks.status = ?
            `;
            const results = await Database.execute(query, [status]);
            return results;
        } catch (error) {
            Logger.error(`Failed to get all tasks: ${error.message}`);
            throw error;
        }
    }

    /**
     *  Get all tasks users assigned to
     * @returns {Array} - An array of task objects
     */
    async getAllUserTasks(userId, status) {
        try {
            const query = `
                SELECT tasks.*, task_assignments.deadline
                FROM tasks
                LEFT JOIN task_assignments ON tasks.id = task_assignments.task_id
                WHERE task_assignments.user_id = ? AND tasks.status = ?
            `;
            const results = await Database.execute(query, [userId, status]);
            return results;
        } catch (error) {
            Logger.error(`Failed to get all user tasks: ${error.message}`);
            throw error;
        }
    }

    /**
     *  Get all tasks with multiple status
     * @param {Array} statuses - Array of status strings
     * @returns {Array} - An array of task objects
     */
    async getAllTasksWithStatus(statuses) {
        try {
            const placeholders = statuses.map(() => '?').join(',');
            const query = `
                SELECT tasks.*, task_assignments.user_id, task_assignments.deadline
                FROM tasks
                LEFT JOIN task_assignments ON tasks.id = task_assignments.task_id
                WHERE tasks.status IN (${placeholders})
            `;
            const results = await Database.execute(query, statuses);
            return results;
        } catch (error) {
            Logger.error(`Failed to get all tasks with status: ${error.message}`);
            throw error;
        }
    }

    /**
     *  Get all user tasks with multiple status
     * @param {string} userId - The user ID
     * @param {Array} statuses - Array of status strings
     * @returns {Array} - An array of task objects
     */
    async getAllUserTasksWithStatus(userId, statuses) {
        try {
            const placeholders = statuses.map(() => '?').join(',');
            const query = `
                SELECT tasks.*, task_assignments.deadline
                FROM tasks
                LEFT JOIN task_assignments ON tasks.id = task_assignments.task_id
                WHERE task_assignments.user_id = ? AND tasks.status IN (${placeholders})
            `;
            const results = await Database.execute(query, [userId, ...statuses]);
            return results;
        } catch (error) {
            Logger.error(`Failed to get all user tasks with status: ${error.message}`);
            throw error;
        }
    }

    /**
     *  Mark a task as completed
     * @param {number} taskId - The ID of the task to mark as completed
     * @returns {boolean} - True if the task was marked as completed, false otherwise
    */
    async markTaskAsCompleted(taskId) {
        try {
            const query = 'UPDATE tasks SET status = "completed" WHERE id = ?';
            const result = await Database.execute(query, [taskId]);
            const secondQuery = 'UPDATE task_assignments SET is_completed = TRUE WHERE task_id = ?';
            await Database.execute(secondQuery, [taskId]);

            Logger.info(`Task ${taskId} marked as completed`);

            return result.affectedRows > 0;
        } catch (error) {
            Logger.error(`Failed to mark task as completed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update a task status
     * @param {number} taskId - The ID of the task to update
     * @param {string} newStatus - The new status for the task
     * @returns {boolean} - True if the task was updated successfully, false otherwise
     */
    async updateTaskStatus(taskId, newStatus) {
        try {
            // Validate status
            const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled', 'overdue'];
            if (!validStatuses.includes(newStatus)) {
                throw new Error(`Invalid status: ${newStatus}`);
            }

            const query = 'UPDATE tasks SET status = ? WHERE id = ?';
            const result = await Database.execute(query, [newStatus, taskId]);

            // Update task_assignments table based on status
            if (newStatus === 'completed') {
                const secondQuery = 'UPDATE task_assignments SET is_completed = TRUE WHERE task_id = ?';
                await Database.execute(secondQuery, [taskId]);
            } else {
                const secondQuery = 'UPDATE task_assignments SET is_completed = FALSE WHERE task_id = ?';
                await Database.execute(secondQuery, [taskId]);
            }

            Logger.info(`Task ${taskId} status updated to ${newStatus}`);

            return result.affectedRows > 0;
        } catch (error) {
            Logger.error(`Failed to update task status: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get a task by its ID
     * @param {number} taskId - The ID of the task
     * @returns {Object|null} - The task object or null if not found
     */
    async getTaskById(taskId) {
        try {
            const query = `
                SELECT tasks.*, task_assignments.user_id, task_assignments.deadline
                FROM tasks
                LEFT JOIN task_assignments ON tasks.id = task_assignments.task_id
                WHERE tasks.id = ?
                LIMIT 1
            `;
            const results = await Database.execute(query, [taskId]);
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            Logger.error(`Failed to get task by ID: ${error.message}`);
            throw error;
        }
    }

    /**
     * Store the last completed task for undo functionality
     * @param {string} userId - The ID of the user who completed the task
     * @param {number} taskId - The ID of the completed task
     */
    async setLastCompletedTask(userId, taskId) {
        try {
            const query = `
                INSERT INTO last_completed_tasks (user_id, task_id) 
                VALUES (?, ?) 
                ON DUPLICATE KEY UPDATE task_id = ?, completed_at = CURRENT_TIMESTAMP
            `;
            await Database.execute(query, [userId, taskId, taskId]);
            Logger.info(`Stored last completed task ${taskId} for user ${userId}`);
        } catch (error) {
            Logger.error(`Failed to store last completed task: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get the last completed task by a user
     * @param {string} userId - The ID of the user
     * @returns {number|null} - The task ID or null if not found
     */
    async getLastCompletedTask(userId) {
        try {
            const query = 'SELECT task_id FROM last_completed_tasks WHERE user_id = ?';
            const results = await Database.execute(query, [userId]);
            return results.length > 0 ? results[0].task_id : null;
        } catch (error) {
            Logger.error(`Failed to get last completed task: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get the most recent completed task globally (for admin use)
     * @returns {Object|null} - Object with taskId and userId, or null if no completed tasks
     */
    async getLastCompletedTaskGlobal() {
        try {
            const query = `
                SELECT task_id, user_id, completed_at 
                FROM last_completed_tasks 
                ORDER BY completed_at DESC 
                LIMIT 1
            `;
            const results = await Database.execute(query);
            if (results.length > 0) {
                return {
                    taskId: results[0].task_id,
                    userId: results[0].user_id
                };
            }
            return null;
        } catch (error) {
            Logger.error(`Failed to get last completed task globally: ${error.message}`);
            throw error;
        }
    }

    /**
     * Undo a task completion
     * @param {number} taskId - The ID of the task to undo completion
     * @returns {boolean} - True if successful, false otherwise
     */
    async undoTaskCompletion(taskId) {
        try {
            const query = 'UPDATE tasks SET status = "in_progress" WHERE id = ?';
            const result = await Database.execute(query, [taskId]);
            const secondQuery = 'UPDATE task_assignments SET is_completed = FALSE WHERE task_id = ?';
            await Database.execute(secondQuery, [taskId]);

            Logger.info(`Task ${taskId} completion undone`);
            return result.affectedRows > 0;
        } catch (error) {
            Logger.error(`Failed to undo task completion: ${error.message}`);
            throw error;
        }
    }

    /**
     * Clear the last completed task record
     * @param {string} userId - The ID of the user
     */
    async clearLastCompletedTask(userId) {
        try {
            const query = 'DELETE FROM last_completed_tasks WHERE user_id = ?';
            await Database.execute(query, [userId]);
            Logger.info(`Cleared last completed task for user ${userId}`);
        } catch (error) {
            Logger.error(`Failed to clear last completed task: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check for overdue tasks and update their status
     */
    async checkAndUpdateOverdueTasks() {
        try {
            const query = `
                UPDATE tasks 
                INNER JOIN task_assignments ON tasks.id = task_assignments.task_id
                SET tasks.status = 'overdue'
                WHERE tasks.status = 'in_progress' 
                AND task_assignments.deadline < NOW()
                AND task_assignments.deadline IS NOT NULL
            `;

            const result = await Database.execute(query);

            if (result.affectedRows > 0) {
                Logger.info(`Updated ${result.affectedRows} overdue tasks`);

                // Get the overdue tasks to send notifications
                const overdueTasksQuery = `
                    SELECT tasks.*, task_assignments.user_id, task_assignments.deadline
                    FROM tasks
                    INNER JOIN task_assignments ON tasks.id = task_assignments.task_id
                    WHERE tasks.status = 'overdue'
                    AND tasks.updated_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
                `;

                const overdueTasks = await Database.execute(overdueTasksQuery);

                // Send notifications for newly overdue tasks
                for (const task of overdueTasks) {
                    await this.sendOverdueNotification(task);
                }
            }

            return result.affectedRows;
        } catch (error) {
            Logger.error(`Failed to check and update overdue tasks: ${error.message}`);
            throw error;
        }
    }

    /**
     * Send notification for overdue task
     * @param {Object} task - The overdue task object
     */
    async sendOverdueNotification(task) {
        try {
            // This would need the channel ID stored somewhere or passed as parameter
            // For now, we'll just log it. You can implement channel notification later
            Logger.info(`Task ${task.id} (${task.title}) is now overdue for user ${task.user_id}`);

            // TODO: Implement actual Discord notification
            // const channel = this.client.channels.cache.get(channelId);
            // if (channel) {
            //     await channel.send(`⚠️ <@${task.user_id}> <@${task.created_by_user_id}> Task **${task.title}** đã quá hạn!`);
            // }
        } catch (error) {
            Logger.error(`Failed to send overdue notification: ${error.message}`);
        }
    }

    /**
     * Send a reminder to the user about an upcoming task
     * @param {Object} params - The parameters for the reminder
    */
    async sendTaskReminder(params) {
        const { taskId, userIds, remindType, createdAtChannel } = params;

        // Get task details
        const task = await Database.execute('SELECT * FROM tasks WHERE id = ?', [taskId]);

        // Check if task exists
        if (!task || task.length === 0) {
            Logger.error(`Task ${taskId} not found for reminder`);
            return;
        }

        //check task status before sending reminder
        if (task[0].status === 'completed' || task[0].status === 'canceled') {
            Logger.info(`Task ${taskId} is already ${task[0].status}. No reminder sent.`);
            return;
        }

        // Generate last paragraph of the reminder message based on remindType
        let lastParagraph = '';
        if (remindType === '23Auto') {
            lastParagraph = 'Sắp hết hạn! Đây là nhắc nhở tự động 23 giờ sau khi tạo nhiệm vụ.';
        } else if (remindType.endsWith('Day')) {
            const days = remindType.replace('Day', '');
            lastParagraph = `Còn ${days} ngày nữa là đến hạn!`;
        } else if (remindType === 'TimeOnly') {
            const time = VietnamTime.formatVN(VietnamTime.now().add(1, 'hour')).fullDisplay;
            lastParagraph = `1 giờ! (${time})`;
        }

        try {
            // Send to server channel
            const channel = this.client.channels.cache.get(createdAtChannel);
            if (!channel) {
                Logger.error(`Channel ${createdAtChannel} not found for task reminder`);
                return;
            }

            const embed = this.buildReminderEmbed(task, lastParagraph);
            const mentionString = userIds.map(id => `<@${id}>`).join(' ');

            const button = new ButtonBuilder()
                .setCustomId(`markComplete`)
                .setLabel('Đánh dấu hoàn thành')
                .setStyle(ButtonStyle.Success);
            const actionRow = new ActionRowBuilder().addComponents(button);

            const remindMessage = await channel.send({
                content: `⏰ ${mentionString}`,
                embeds: [embed],
                components: [actionRow]
            });

            Logger.info(`Sent task reminder to users ${mentionString} for task ${taskId}`);

            const filter = i => {
                return userIds.includes(i.user.id) && i.customId === `markComplete`;
            };

            const collector = remindMessage.createMessageComponentCollector({
                filter,
                time: 300000,
                max: 1
            });

            collector.on('collect', async i => {
                try {
                    // Acknowledge interaction immediately to prevent timeout
                    await i.deferUpdate();

                    Logger.info(`Button clicked by user ${i.user.id} for task ${taskId}`);

                    // Mark task as completed
                    const result = await this.markTaskAsCompleted(taskId);

                    if (result) {
                        await i.editReply({
                            content: `✅ <@${i.user.id}> đã đánh dấu công việc **${task[0].title}** là hoàn thành.`,
                            embeds: [],
                            components: []
                        });
                        Logger.info(`Task ${taskId} marked as completed by user ${i.user.id}`);
                    } else {
                        await i.editReply({
                            content: '❌ Không thể đánh dấu công việc là hoàn thành.',
                            embeds: [],
                            components: []
                        });
                    }
                } catch (error) {
                    Logger.error(`Error handling button click for task ${taskId}: ${error.message}`);
                    try {
                        if (i.deferred) {
                            await i.editReply({
                                content: '❌ Đã xảy ra lỗi khi xử lý yêu cầu.',
                                embeds: [],
                                components: []
                            });
                        } else {
                            await i.reply({
                                content: '❌ Đã xảy ra lỗi khi xử lý yêu cầu.',
                                ephemeral: true
                            });
                        }
                    } catch (replyError) {
                        Logger.error(`Failed to send error message: ${replyError.message}`);
                    }
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    Logger.info(`Task reminder collector for task ${taskId} ended due to timeout`);
                }
            });

        } catch (error) {
            Logger.error(`Error sending task reminder: ${error.message}`);
        }
    }

    buildReminderEmbed(task, lastParagraph) {
        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('Nhắc nhở công việc')
            .setDescription('Đây là nhắc nhở cho công việc của bạn:')
            .addFields(
                { name: 'Công việc:', value: task[0].title },
                { name: 'Thời gian còn lại:', value: lastParagraph }
            )
            .setTimestamp();

        if (task[0].description) {
            embed.addFields({ name: 'Mô tả:', value: task[0].description });
        }

        if (task[0].link) {
            embed.addFields({ name: 'Liên kết:', value: task[0].link });
        }

        if (task[0].created_by_user_id) {
            embed.addFields({ name: 'Người tạo:', value: `<@${task[0].created_by_user_id}>` });
        }

        return embed;
    }

    /**
     * Get all tasks with all statuses
     * @returns {Array} - An array of task objects
     */
    async getAllTasksAllStatus() {
        try {
            const query = `
                SELECT tasks.*, task_assignments.user_id, task_assignments.deadline
                FROM tasks
                LEFT JOIN task_assignments ON tasks.id = task_assignments.task_id
                ORDER BY tasks.created_at DESC
            `;
            const results = await Database.execute(query);
            return results;
        } catch (error) {
            Logger.error(`Failed to get all tasks (all status): ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all user tasks with all statuses
     * @param {string} userId - The user ID
     * @returns {Array} - An array of task objects
     */
    async getAllUserTasksAllStatus(userId) {
        try {
            const query = `
                SELECT tasks.*, task_assignments.deadline
                FROM tasks
                LEFT JOIN task_assignments ON tasks.id = task_assignments.task_id
                WHERE task_assignments.user_id = ?
                ORDER BY tasks.created_at DESC
            `;
            const results = await Database.execute(query, [userId]);
            return results;
        } catch (error) {
            Logger.error(`Failed to get all user tasks (all status): ${error.message}`);
            throw error;
        }
    }
}

module.exports = TaskManagerModule;