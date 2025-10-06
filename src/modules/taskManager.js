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

            // Restore task reminders after bot restart
            try {
                await this.restoreTaskReminders();
                Logger.info('✅ Task reminders restored successfully');
            } catch (restoreError) {
                Logger.warn(`⚠️ Failed to restore task reminders: ${restoreError.message}`);
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
                    created_at_channel VARCHAR(30) NULL,
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
                    INSERT INTO tasks (title, description, link, created_by_user_id, created_at_channel)
                    VALUES (?, ?, ?, ?, ?)
                `;
            const taskId = await Database.execute(query, [title, description, link, createdBy, createdAtChannel]).then(result => result.insertId);
            Logger.info(`Task created with ID ${taskId}`);

            // Logic mới cho deadline:
            // - Cả time và date: giờ cụ thể trong ngày cụ thể
            // - Chỉ có date: 23h trong ngày đó
            // - Chỉ có time: giờ đó trong cùng ngày (nếu đã qua thì ngày hôm sau)
            // - Không có gì: null (không deadline)
            let deadline = null;
            if (time && date) {
                // Có cả giờ và ngày
                deadline = VietnamTime.parseDate(date)
                    .hours(parseInt(time.split(':')[0], 10))
                    .minutes(parseInt(time.split(':')[1], 10))
                    .seconds(0)
                    .milliseconds(0)
                    .toDate();
            } else if (date) {
                // Chỉ có ngày -> 23h trong ngày đó
                deadline = VietnamTime.parseDate(date)
                    .hours(23)
                    .minutes(0)
                    .seconds(0)
                    .milliseconds(0)
                    .toDate();
            } else if (time) {
                // Chỉ có giờ -> giờ đó trong cùng ngày (nếu đã qua thì ngày mai)
                deadline = VietnamTime.nextOccurrenceOf(time)
                    .seconds(0)
                    .milliseconds(0)
                    .toDate();
            }
            // else: không có time và date -> deadline = null

            for (const userId of userIds) {
                const assignmentQuery = `
                        INSERT INTO task_assignments (task_id, user_id, deadline)
                        VALUES (?, ?, ?)
                    `;
                await Database.execute(assignmentQuery, [taskId, userId, deadline]);
                Logger.info(`Task ${taskId} assigned to user ${userId} with deadline ${deadline}`);
            }

            // Logic mới cho reminders dựa theo deadline
            await this.createTaskReminders(taskId, title, userIds, time, date, deadline, createdAtChannel);

            return true;

        } catch (error) {
            Logger.error(`Failed to create task: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create reminders for a task based on its deadline configuration
     * @param {number} taskId - The ID of the task
     * @param {string} title - The title of the task
     * @param {Array} userIds - Array of user IDs
     * @param {string} time - Time string (HH:MM) or null
     * @param {string} date - Date string (DD-MM-YYYY) or null
     * @param {Date} deadline - Calculated deadline Date object or null
     * @param {string} createdAtChannel - Channel ID where task was created
     */
    async createTaskReminders(taskId, title, userIds, time, date, deadline, createdAtChannel) {
        try {
            // Trường hợp 1: Không có deadline (không có time và date)
            // -> Tạo reminder hàng tuần
            if (!time && !date) {
                Logger.info(`Creating weekly reminder for task ${taskId} (no deadline)`);

                await NodeCron.createCronJob({
                    name: `task-weekly-reminder-${taskId}`,
                    description: `Weekly reminder for task: ${title}`,
                    cronExpression: '0 9 * * 1', // Mỗi thứ 2 lúc 9h sáng
                    functionName: 'sendWeeklyTaskReminder',
                    moduleName: 'taskManager',
                    functionParams: { taskId, userIds, createdAtChannel }
                });

                return;
            }

            // Trường hợp 2: Có date (có thể có hoặc không có time)
            // -> Tạo reminder 14, 7, 3 ngày trước
            if (date) {
                const daysUntilDeadline = VietnamTime.daysUntil(date);
                const reminderDates = VietnamTime.createReminderDates(date, [14, 7, 3]);

                for (const reminderDate of reminderDates) {
                    const daysBeforeDeadline = Math.ceil((deadline - VietnamTime.toDate(reminderDate)) / (1000 * 60 * 60 * 24));

                    await NodeCron.createOneTimeJob({
                        name: `task-reminder-${taskId}-${reminderDate.valueOf()}`,
                        description: `Reminder ${daysBeforeDeadline} days before deadline for task: ${title}`,
                        scheduledTime: VietnamTime.toDate(reminderDate),
                        functionName: 'sendTaskReminder',
                        moduleName: 'taskManager',
                        functionParams: {
                            taskId,
                            userIds,
                            remindType: `${daysBeforeDeadline}Day`,
                            createdAtChannel
                        }
                    });
                }

                Logger.info(`Created ${reminderDates.length} date-based reminder(s) for task ${taskId}`);
            }

            // Trường hợp 3: Chỉ có time (không có date)
            // -> Reminder 1 giờ trước giờ deadline
            if (time && !date) {
                const timeUntilDeadline = VietnamTime.nextOccurrenceOf(time);
                const reminderTime = timeUntilDeadline.clone().subtract(1, 'hour');

                // Chỉ tạo reminder nếu reminder time chưa qua
                if (VietnamTime.toDate(reminderTime) > VietnamTime.toDate(VietnamTime.now())) {
                    Logger.info(`Scheduling time-based reminder for: ${VietnamTime.formatVN(reminderTime).fullDisplay} (1 hour before deadline)`);

                    await NodeCron.createOneTimeJob({
                        name: `task-reminder-${taskId}-${reminderTime.valueOf()}`,
                        description: `Reminder 1 hour before deadline for task: ${title}`,
                        scheduledTime: VietnamTime.toDate(reminderTime),
                        functionName: 'sendTaskReminder',
                        moduleName: 'taskManager',
                        functionParams: { taskId, userIds, remindType: '1Hour', createdAtChannel }
                    });
                } else {
                    Logger.warn(`Reminder time has passed for task ${taskId}, skipping 1-hour reminder`);
                }
            }

        } catch (error) {
            Logger.error(`Failed to create task reminders: ${error.message}`);
            // Không throw error để không ảnh hưởng đến việc tạo task
        }
    }

    /**
     * Restore task reminders after bot restart
     * Checks database for active tasks and recreates their cron jobs
     */
    async restoreTaskReminders() {
        try {
            Logger.loading('Restoring task reminders...');

            // Get all active tasks (in_progress and pending)
            const query = `
                SELECT DISTINCT
                    tasks.id,
                    tasks.title,
                    tasks.status,
                    tasks.created_at,
                    tasks.created_at_channel,
                    task_assignments.deadline,
                    task_assignments.user_id
                FROM tasks
                LEFT JOIN task_assignments ON tasks.id = task_assignments.task_id
                WHERE tasks.status IN ('in_progress', 'pending')
                ORDER BY tasks.id
            `;

            const tasks = await Database.execute(query);

            if (tasks.length === 0) {
                Logger.info('No active tasks found to restore reminders');
                return;
            }

            // Group tasks by task_id to get all user_ids
            const taskMap = new Map();
            for (const task of tasks) {
                if (!taskMap.has(task.id)) {
                    taskMap.set(task.id, {
                        id: task.id,
                        title: task.title,
                        status: task.status,
                        created_at: task.created_at,
                        created_at_channel: task.created_at_channel,
                        deadline: task.deadline,
                        userIds: []
                    });
                }
                if (task.user_id) {
                    taskMap.get(task.id).userIds.push(task.user_id);
                }
            }

            Logger.info(`Found ${taskMap.size} active tasks to restore reminders`);

            let restoredCount = 0;
            for (const [taskId, taskData] of taskMap) {
                try {
                    // Determine if task has deadline and what type
                    if (!taskData.deadline) {
                        // No deadline -> weekly reminder
                        await this.restoreWeeklyReminder(taskData);
                        restoredCount++;
                    } else {
                        // Has deadline -> restore appropriate reminders
                        await this.restoreDateTimeReminders(taskData);
                        restoredCount++;
                    }
                } catch (error) {
                    Logger.warn(`Failed to restore reminders for task ${taskId}: ${error.message}`);
                }
            }

            Logger.success(`✅ Restored reminders for ${restoredCount}/${taskMap.size} tasks`);

        } catch (error) {
            Logger.error(`Failed to restore task reminders: ${error.message}`);
            throw error;
        }
    }

    /**
     * Restore weekly reminder for task without deadline
     * @param {Object} taskData - Task data object
     */
    async restoreWeeklyReminder(taskData) {
        try {
            // Check if weekly reminder cron job already exists
            const existingJob = await Database.execute(
                'SELECT id FROM cron_jobs WHERE name = ?',
                [`task-weekly-reminder-${taskData.id}`]
            );

            if (existingJob.length > 0) {
                Logger.info(`Weekly reminder already exists for task ${taskData.id}`);
                return;
            }

            // Create weekly reminder
            await NodeCron.createCronJob({
                name: `task-weekly-reminder-${taskData.id}`,
                description: `Weekly reminder for task: ${taskData.title}`,
                cronExpression: '0 9 * * 1', // Mỗi thứ 2 lúc 9h sáng
                functionName: 'sendWeeklyTaskReminder',
                moduleName: 'taskManager',
                functionParams: {
                    taskId: taskData.id,
                    userIds: taskData.userIds,
                    createdAtChannel: taskData.created_at_channel
                }
            });

            Logger.info(`✅ Restored weekly reminder for task ${taskData.id}`);

        } catch (error) {
            Logger.error(`Failed to restore weekly reminder for task ${taskData.id}: ${error.message}`);
        }
    }

    /**
     * Restore date/time based reminders for tasks with deadline
     * @param {Object} taskData - Task data object
     */
    async restoreDateTimeReminders(taskData) {
        try {
            const now = VietnamTime.now();
            const deadline = VietnamTime.create(taskData.deadline);

            // Check if deadline has already passed
            if (deadline.isBefore(now)) {
                Logger.info(`Deadline has passed for task ${taskData.id}, skipping reminder restoration`);
                return;
            }

            const deadlineTime = deadline.format('HH:mm');
            const isEndOfDay = deadlineTime === '23:00'; // Deadline là 23h -> chỉ có date

            // Case 1: Date-based deadline (23:00 = only date was provided)
            if (isEndOfDay) {
                const daysUntilDeadline = deadline.diff(now, 'days');
                const reminders = [14, 7, 3].filter(days => daysUntilDeadline >= days);

                for (const daysBeforeDeadline of reminders) {
                    const reminderDate = deadline.clone().subtract(daysBeforeDeadline, 'days').startOf('day').hours(9);

                    // Only create if reminder time is in the future
                    if (reminderDate.isAfter(now)) {
                        await NodeCron.createOneTimeJob({
                            name: `task-reminder-${taskData.id}-${reminderDate.valueOf()}`,
                            description: `Reminder ${daysBeforeDeadline} days before deadline for task: ${taskData.title}`,
                            scheduledTime: VietnamTime.toDate(reminderDate),
                            functionName: 'sendTaskReminder',
                            moduleName: 'taskManager',
                            functionParams: {
                                taskId: taskData.id,
                                userIds: taskData.userIds,
                                remindType: `${daysBeforeDeadline}Day`,
                                createdAtChannel: taskData.created_at_channel
                            }
                        });
                    }
                }

                Logger.info(`✅ Restored date-based reminders for task ${taskData.id}`);
            }
            // Case 2: Time-based deadline (specific hour)
            else {
                const reminderTime = deadline.clone().subtract(1, 'hour');

                // Only create if reminder time is in the future
                if (reminderTime.isAfter(now)) {
                    await NodeCron.createOneTimeJob({
                        name: `task-reminder-${taskData.id}-${reminderTime.valueOf()}`,
                        description: `Reminder 1 hour before deadline for task: ${taskData.title}`,
                        scheduledTime: VietnamTime.toDate(reminderTime),
                        functionName: 'sendTaskReminder',
                        moduleName: 'taskManager',
                        functionParams: {
                            taskId: taskData.id,
                            userIds: taskData.userIds,
                            remindType: '1Hour',
                            createdAtChannel: taskData.created_at_channel
                        }
                    });

                    Logger.info(`✅ Restored time-based reminder for task ${taskData.id}`);
                } else {
                    Logger.info(`Reminder time has passed for task ${taskData.id}`);
                }
            }

        } catch (error) {
            Logger.error(`Failed to restore date/time reminders for task ${taskData.id}: ${error.message}`);
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
     * Send weekly reminder for tasks without deadline
     * @param {Object} params - The parameters for the reminder
     */
    async sendWeeklyTaskReminder(params) {
        const { taskId, userIds, createdAtChannel } = params;

        try {
            // Get task details
            const task = await Database.execute('SELECT * FROM tasks WHERE id = ?', [taskId]);

            // Check if task exists
            if (!task || task.length === 0) {
                Logger.info(`Task ${taskId} not found for weekly reminder, may have been deleted`);
                return;
            }

            // Check task status before sending reminder
            if (task[0].status === 'completed' || task[0].status === 'canceled') {
                Logger.info(`Task ${taskId} is already ${task[0].status}. Stopping weekly reminders.`);

                // Stop the cron job
                await NodeCron.stopCronJobByName(`task-weekly-reminder-${taskId}`);
                return;
            }

            // Send to server channel
            const channel = this.client.channels.cache.get(createdAtChannel);
            if (!channel) {
                Logger.error(`Channel ${createdAtChannel} not found for weekly task reminder`);
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('📅 Nhắc nhở công việc hàng tuần')
                .setDescription('Công việc này chưa có deadline, đây là nhắc nhở định kỳ:')
                .addFields(
                    { name: 'Công việc:', value: task[0].title },
                    { name: 'Trạng thái:', value: task[0].status === 'in_progress' ? '⏳ Đang thực hiện' : task[0].status }
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

            const button = new ButtonBuilder()
                .setCustomId(`markComplete`)
                .setLabel('Đánh dấu hoàn thành')
                .setStyle(ButtonStyle.Success);
            const actionRow = new ActionRowBuilder().addComponents(button);

            const mentionString = userIds.map(id => `<@${id}>`).join(' ');
            const remindMessage = await channel.send({
                content: `📢 ${mentionString} - Nhắc nhở hàng tuần`,
                embeds: [embed],
                components: [actionRow]
            });

            Logger.info(`Sent weekly reminder to users for task ${taskId}`);

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
                    await i.deferUpdate();
                    Logger.info(`Button clicked by user ${i.user.id} for task ${taskId}`);

                    const result = await this.markTaskAsCompleted(taskId);

                    if (result) {
                        await i.editReply({
                            content: `✅ <@${i.user.id}> đã đánh dấu công việc **${task[0].title}** là hoàn thành.`,
                            embeds: [],
                            components: []
                        });

                        // Stop weekly reminder
                        await NodeCron.stopCronJobByName(`task-weekly-reminder-${taskId}`);
                        Logger.info(`Task ${taskId} marked as completed, weekly reminder stopped`);
                    } else {
                        await i.editReply({
                            content: '❌ Không thể đánh dấu công việc là hoàn thành.',
                            embeds: [],
                            components: []
                        });
                    }
                } catch (error) {
                    Logger.error(`Error handling button click for weekly reminder task ${taskId}: ${error.message}`);
                }
            });

        } catch (error) {
            Logger.error(`Error sending weekly task reminder: ${error.message}`);
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
        if (remindType === '1Hour') {
            lastParagraph = '⏰ Còn 1 giờ nữa là đến hạn!';
        } else if (remindType.endsWith('Day')) {
            const days = remindType.replace('Day', '');
            lastParagraph = `📅 Còn ${days} ngày nữa là đến hạn!`;
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