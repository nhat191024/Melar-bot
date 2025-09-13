const cron = require('node-cron');
const { CronExpressionParser } = require('cron-parser');
const Logger = require('./Logger');
const Database = require('./Database');
const VietnamTime = require('./VietnamTime');

/**
 * NodeCron Helper Class
 * Manages cron jobs with database persistence
 */
class NodeCron {
    constructor() {
        this.activeCronJobs = new Map(); // Map to store active cron job instances
        this.initialized = false;
    }

    /**
     * Initialize the NodeCron helper
     * Creates necessary database tables and loads existing cron jobs
     */
    async initialize() {
        try {
            Logger.loading('Initializing NodeCron helper...');

            await this.createTables();
            await this.loadCronJobsFromDatabase();

            this.initialized = true;
            Logger.success('✅ NodeCron helper initialized successfully');
        } catch (error) {
            Logger.error(`❌ Failed to initialize NodeCron helper: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create necessary database tables for cron jobs
     */
    async createTables() {
        try {
            const cronJobsTable = `
                CREATE TABLE IF NOT EXISTS cron_jobs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL UNIQUE,
                    description TEXT,
                    cron_expression VARCHAR(50) NOT NULL,
                    function_name VARCHAR(100) NOT NULL,
                    module_name VARCHAR(50) NOT NULL,
                    function_params JSON DEFAULT NULL,
                    enabled BOOLEAN DEFAULT TRUE,
                    last_run DATETIME DEFAULT NULL,
                    next_run DATETIME DEFAULT NULL,
                    run_count INT DEFAULT 0,
                    error_count INT DEFAULT 0,
                    last_error TEXT DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_name (name),
                    INDEX idx_module (module_name),
                    INDEX idx_enabled (enabled),
                    INDEX idx_next_run (next_run)
                )
            `;

            await Database.execute(cronJobsTable);
            Logger.info('Cron jobs table created/verified');

            // Cron job execution log table
            const cronLogsTable = `
                CREATE TABLE IF NOT EXISTS cron_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    cron_job_id INT NOT NULL,
                    execution_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                    status ENUM('success', 'error', 'timeout') NOT NULL,
                    execution_duration_ms INT DEFAULT 0,
                    output TEXT DEFAULT NULL,
                    error_message TEXT DEFAULT NULL,
                    INDEX idx_cron_job_id (cron_job_id),
                    INDEX idx_execution_time (execution_time),
                    INDEX idx_status (status),
                    FOREIGN KEY (cron_job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
                )
            `;

            await Database.execute(cronLogsTable);
            Logger.info('Cron logs table created/verified');

        } catch (error) {
            Logger.error(`Failed to create cron tables: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a new cron job
     * @param {Object} jobConfig - Cron job configuration
     * @param {string} jobConfig.name - Unique name for the cron job
     * @param {string} jobConfig.description - Description of what the job does
     * @param {string} jobConfig.cronExpression - Cron expression (e.g., '0 0 6,12,18 * * *')
     * @param {string} jobConfig.functionName - Name of the function to execute
     * @param {string} jobConfig.moduleName - Module that contains the function
     * @param {Object} jobConfig.functionParams - Parameters to pass to the function
     * @param {boolean} jobConfig.enabled - Whether the job should be enabled immediately
     * @returns {Promise<number>} - ID of the created cron job
     */
    async createCronJob(jobConfig) {
        try {
            const {
                name,
                description = '',
                cronExpression,
                functionName,
                moduleName,
                functionParams = null,
                enabled = true
            } = jobConfig;

            // Validate cron expression
            if (!cron.validate(cronExpression)) {
                throw new Error(`Invalid cron expression: ${cronExpression}`);
            }

            // Calculate next run time
            const nextRun = this.getNextRunTime(cronExpression);

            const query = `
                INSERT INTO cron_jobs (
                    name, description, cron_expression, function_name, 
                    module_name, function_params, enabled, next_run
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const result = await Database.execute(query, [
                name,
                description,
                cronExpression,
                functionName,
                moduleName,
                functionParams ? JSON.stringify(functionParams) : null,
                enabled,
                nextRun
            ]);

            const cronJobId = result.insertId;

            // Start the cron job if enabled
            if (enabled) {
                await this.startCronJob(cronJobId);
            }

            Logger.success(`✅ Cron job '${name}' created successfully with ID: ${cronJobId}`);
            return cronJobId;

        } catch (error) {
            Logger.error(`❌ Failed to create cron job: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create a one-time scheduled job for a specific date and time
     * @param {Object} jobConfig - One-time job configuration
     * @param {string} jobConfig.name - Unique name for the job
     * @param {string} jobConfig.description - Description of what the job does
     * @param {Date|string} jobConfig.scheduledTime - When to run the job (Date object or ISO string)
     * @param {string} jobConfig.functionName - Name of the function to execute
     * @param {string} jobConfig.moduleName - Module that contains the function
     * @param {Object} jobConfig.functionParams - Parameters to pass to the function
     * @returns {Promise<number>} - ID of the created scheduled job
     */
    async createOneTimeJob(jobConfig) {
        try {
            const {
                name,
                description = '',
                scheduledTime,
                functionName,
                moduleName,
                functionParams = null
            } = jobConfig;

            // Parse scheduled time
            let targetTime;
            if (typeof scheduledTime === 'string') {
                targetTime = new Date(scheduledTime);
            } else if (scheduledTime instanceof Date) {
                targetTime = scheduledTime;
            } else {
                throw new Error('scheduledTime must be a Date object or ISO string');
            }

            // Validate time is in the future (compare with Vietnam time)
            const currentVNTime = VietnamTime.toDate(VietnamTime.now());
            if (targetTime <= currentVNTime) {
                throw new Error(`Scheduled time must be in the future. Current VN time: ${VietnamTime.formatVN(VietnamTime.now()).fullDisplay}, Scheduled: ${targetTime}`);
            }

            // Calculate delay in milliseconds
            const delay = targetTime.getTime() - currentVNTime.getTime();

            Logger.info(`One-time job scheduled: ${targetTime} (delay: ${Math.round(delay / 1000 / 60)} minutes from now)`);

            // Store in database with special one-time flag
            const query = `
                INSERT INTO cron_jobs (
                    name, description, cron_expression, function_name, 
                    module_name, function_params, enabled, next_run
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const result = await Database.execute(query, [
                name,
                description,
                'ONE_TIME_JOB', // Special marker for one-time jobs
                functionName,
                moduleName,
                functionParams ? JSON.stringify(functionParams) : null,
                true,
                targetTime
            ]);

            const jobId = result.insertId;

            // Schedule the one-time execution
            const timeoutId = setTimeout(async () => {
                try {
                    await this.executeOneTimeJob({
                        id: jobId,
                        name,
                        function_name: functionName,
                        module_name: moduleName,
                        function_params: functionParams ? JSON.stringify(functionParams) : null
                    });

                    // Mark as completed and disable
                    await Database.execute(
                        'UPDATE cron_jobs SET enabled = FALSE, last_run = CURRENT_TIMESTAMP WHERE id = ?',
                        [jobId]
                    );

                    // Remove from active jobs
                    this.activeCronJobs.delete(jobId);

                } catch (error) {
                    Logger.error(`One-time job execution failed: ${error.message}`);
                    await this.updateJobStats(jobId, false, error.message);
                }
            }, delay);

            // Store the timeout reference
            this.activeCronJobs.set(jobId, {
                instance: { timeoutId, type: 'one-time' },
                data: { ...jobConfig, id: jobId, scheduledTime: targetTime }
            });

            Logger.success(`✅ One-time job '${name}' scheduled for ${targetTime.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
            return jobId;

        } catch (error) {
            Logger.error(`❌ Failed to create one-time job: ${error.message}`);
            throw error;
        }
    }

    /**
     * Execute a one-time job
     * @param {Object} jobData - Job data
     */
    async executeOneTimeJob(jobData) {
        const startTime = Date.now();
        let status = 'success';
        let errorMessage = null;
        let output = null;

        try {
            Logger.info(`⚡ Executing one-time job: ${jobData.name}`);

            // Get module and function (same logic as regular cron jobs)
            const moduleManager = global.moduleManager || require('../DiscordBot').moduleManager;

            if (!moduleManager) {
                throw new Error('ModuleManager not available');
            }

            const module = moduleManager.getModule(jobData.module_name);

            if (!module) {
                throw new Error(`Module '${jobData.module_name}' not found`);
            }

            const targetFunction = module[jobData.function_name];

            if (typeof targetFunction !== 'function') {
                throw new Error(`Function '${jobData.function_name}' not found in module '${jobData.module_name}'`);
            }

            // Parse function parameters
            let params = null;
            if (jobData.function_params) {
                // Handle case where function_params might already be an object (from database)
                if (typeof jobData.function_params === 'string') {
                    params = JSON.parse(jobData.function_params);
                } else {
                    params = jobData.function_params;
                }
            }

            // Execute the function
            if (params && Array.isArray(params)) {
                output = await targetFunction.apply(module, params);
            } else if (params) {
                output = await targetFunction.call(module, params);
            } else {
                output = await targetFunction.call(module);
            }

            Logger.success(`✅ One-time job '${jobData.name}' completed successfully`);

        } catch (error) {
            status = 'error';
            errorMessage = error.message;
            Logger.error(`❌ One-time job '${jobData.name}' failed: ${error.message}`);
            throw error;
        }

        const executionDuration = Date.now() - startTime;

        // Log execution
        await this.logExecution(jobData.id, status, executionDuration, output, errorMessage);
    }

    /**
     * Load all cron jobs from database and start enabled ones
     */
    async loadCronJobsFromDatabase() {
        try {
            Logger.loading('Loading cron jobs from database...');

            const query = `
                SELECT * FROM cron_jobs
                WHERE enabled = TRUE
                ORDER BY name
            `;

            const cronJobs = await Database.execute(query);

            for (const jobData of cronJobs) {
                if (jobData.cron_expression === 'ONE_TIME_JOB') {
                    // Handle one-time jobs
                    await this.loadOneTimeJob(jobData);
                } else {
                    // Handle regular cron jobs
                    await this.startCronJob(jobData.id, jobData);
                }
            }

            Logger.success(`✅ Loaded ${cronJobs.length} active cron jobs from database`);

        } catch (error) {
            Logger.error(`❌ Failed to load cron jobs from database: ${error.message}`);
            throw error;
        }
    }

    /**
     * Load and reschedule a one-time job from database
     * @param {Object} jobData - Job data from database
     */
    async loadOneTimeJob(jobData) {
        try {
            const scheduledTime = new Date(jobData.next_run);
            const now = new Date();

            // Check if the scheduled time has passed
            if (scheduledTime <= now) {
                Logger.warn(`One-time job '${jobData.name}' scheduled time has passed, marking as completed`);
                await Database.execute(
                    'UPDATE cron_jobs SET enabled = FALSE, last_run = CURRENT_TIMESTAMP WHERE id = ?',
                    [jobData.id]
                );
                return;
            }

            // Reschedule the job
            const delay = scheduledTime.getTime() - now.getTime();

            const timeoutId = setTimeout(async () => {
                try {
                    await this.executeOneTimeJob(jobData);

                    // Mark as completed and disable
                    await Database.execute(
                        'UPDATE cron_jobs SET enabled = FALSE, last_run = CURRENT_TIMESTAMP WHERE id = ?',
                        [jobData.id]
                    );

                    // Remove from active jobs
                    this.activeCronJobs.delete(jobData.id);

                } catch (error) {
                    Logger.error(`One-time job execution failed: ${error.message}`);
                    await this.updateJobStats(jobData.id, false, error.message);
                }
            }, delay);

            // Store the timeout reference
            this.activeCronJobs.set(jobData.id, {
                instance: { timeoutId, type: 'one-time' },
                data: jobData
            });

            Logger.info(`🕐 Rescheduled one-time job '${jobData.name}' for ${scheduledTime.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);

        } catch (error) {
            Logger.error(`Failed to load one-time job ${jobData.name}: ${error.message}`);
        }
    }

    /**
     * Start a specific cron job
     * @param {number} cronJobId - ID of the cron job to start
     * @param {Object} jobData - Optional job data (to avoid database query)
     */
    async startCronJob(cronJobId, jobData = null) {
        try {
            // Get job data if not provided
            if (!jobData) {
                const query = 'SELECT * FROM cron_jobs WHERE id = ? AND enabled = TRUE';
                const results = await Database.execute(query, [cronJobId]);

                if (results.length === 0) {
                    throw new Error(`Cron job with ID ${cronJobId} not found or disabled`);
                }

                jobData = results[0];
            }

            // Stop existing job if running
            if (this.activeCronJobs.has(cronJobId)) {
                this.stopCronJob(cronJobId);
            }

            // Create and start the cron job
            const cronJob = cron.schedule(jobData.cron_expression, async () => {
                await this.executeCronJob(jobData);
            }, {
                scheduled: false, // Don't start immediately
                timezone: 'Asia/Ho_Chi_Minh' // Set your timezone
            });

            // Store the cron job instance
            this.activeCronJobs.set(cronJobId, {
                instance: cronJob,
                data: jobData
            });

            // Start the job
            cronJob.start();

            Logger.info(`🚀 Started cron job: ${jobData.name} (${jobData.cron_expression})`);

        } catch (error) {
            Logger.error(`❌ Failed to start cron job ${cronJobId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Stop a specific cron job
     * @param {number} cronJobId - ID of the cron job to stop
     */
    stopCronJob(cronJobId) {
        try {
            const cronJobInfo = this.activeCronJobs.get(cronJobId);

            if (cronJobInfo) {
                if (cronJobInfo.instance.type === 'one-time') {
                    // Clear timeout for one-time jobs
                    clearTimeout(cronJobInfo.instance.timeoutId);
                    Logger.info(`⏹️ Cancelled one-time job ID: ${cronJobId}`);
                } else {
                    // Stop regular cron job
                    cronJobInfo.instance.stop();
                    Logger.info(`⏹️ Stopped cron job ID: ${cronJobId}`);
                }
                this.activeCronJobs.delete(cronJobId);
            } else {
                Logger.warn(`Cron job with ID ${cronJobId} is not currently running`);
            }

        } catch (error) {
            Logger.error(`❌ Failed to stop cron job ${cronJobId}: ${error.message}`);
        }
    }

    /**
     * Execute a cron job function
     * @param {Object} jobData - Cron job data from database
     */
    async executeCronJob(jobData) {
        const startTime = Date.now();
        let status = 'success';
        let errorMessage = null;
        let output = null;

        try {
            Logger.info(`⚡ Executing cron job: ${jobData.name}`);

            // Try to get the module and function
            const moduleManager = global.moduleManager || require('../DiscordBot').moduleManager;

            if (!moduleManager) {
                throw new Error('ModuleManager not available');
            }

            const module = moduleManager.getModule(jobData.module_name);

            if (!module) {
                throw new Error(`Module '${jobData.module_name}' not found`);
            }

            const targetFunction = module[jobData.function_name];

            if (typeof targetFunction !== 'function') {
                throw new Error(`Function '${jobData.function_name}' not found in module '${jobData.module_name}'`);
            }

            // Parse function parameters
            let params = null;
            if (jobData.function_params) {
                // Handle case where function_params might already be an object (from database)
                if (typeof jobData.function_params === 'string') {
                    params = JSON.parse(jobData.function_params);
                } else {
                    params = jobData.function_params;
                }
            }

            // Execute the function
            if (params && Array.isArray(params)) {
                output = await targetFunction.apply(module, params);
            } else if (params) {
                output = await targetFunction.call(module, params);
            } else {
                output = await targetFunction.call(module);
            }

            // Update job statistics
            await this.updateJobStats(jobData.id, true);

            Logger.success(`✅ Cron job '${jobData.name}' executed successfully`);

        } catch (error) {
            status = 'error';
            errorMessage = error.message;

            Logger.error(`❌ Cron job '${jobData.name}' failed: ${error.message}`);

            // Update job statistics
            await this.updateJobStats(jobData.id, false, error.message);
        }

        const executionDuration = Date.now() - startTime;

        // Log execution to database
        await this.logExecution(jobData.id, status, executionDuration, output, errorMessage);
    }

    /**
     * Update cron job statistics
     * @param {number} cronJobId - Cron job ID
     * @param {boolean} success - Whether execution was successful
     * @param {string} errorMessage - Error message if failed
     */
    async updateJobStats(cronJobId, success, errorMessage = null) {
        try {
            const nextRun = await this.getNextRunTimeForJob(cronJobId);

            let query;
            let params;

            if (success) {
                query = `
                    UPDATE cron_jobs 
                    SET last_run = CURRENT_TIMESTAMP, 
                        next_run = ?,
                        run_count = run_count + 1,
                        last_error = NULL
                    WHERE id = ?
                `;
                params = [nextRun, cronJobId];
            } else {
                query = `
                    UPDATE cron_jobs 
                    SET last_run = CURRENT_TIMESTAMP,
                        next_run = ?,
                        run_count = run_count + 1,
                        error_count = error_count + 1,
                        last_error = ?
                    WHERE id = ?
                `;
                params = [nextRun, errorMessage, cronJobId];
            }

            await Database.execute(query, params);

        } catch (error) {
            Logger.error(`Failed to update job stats for cron job ${cronJobId}: ${error.message}`);
        }
    }

    /**
     * Log cron job execution
     * @param {number} cronJobId - Cron job ID
     * @param {string} status - Execution status
     * @param {number} duration - Execution duration in milliseconds
     * @param {any} output - Function output
     * @param {string} errorMessage - Error message if failed
     */
    async logExecution(cronJobId, status, duration, output, errorMessage) {
        try {
            const query = `
                INSERT INTO cron_logs (
                    cron_job_id, status, execution_duration_ms, output, error_message
                ) VALUES (?, ?, ?, ?, ?)
            `;

            await Database.execute(query, [
                cronJobId,
                status,
                duration,
                output ? JSON.stringify(output) : null,
                errorMessage
            ]);

        } catch (error) {
            Logger.error(`Failed to log execution for cron job ${cronJobId}: ${error.message}`);
        }
    }

    /**
     * Get next run time for a cron expression
     * @param {string} cronExpression - Cron expression
     * @returns {Date} - Next run time in Vietnam timezone
     */
    getNextRunTime(cronExpression) {
        try {
            // Use Vietnam time for calculating next run
            const currentVNTime = VietnamTime.toDate(VietnamTime.now());

            // Parse the cron expression with Vietnam timezone
            const options = {
                currentDate: currentVNTime,
                tz: 'Asia/Ho_Chi_Minh'
            };

            const interval = CronExpressionParser.parse(cronExpression, options);

            // Get next run time
            const nextRun = interval.next().toDate();

            Logger.info(`Next cron run calculated: ${VietnamTime.formatVN(VietnamTime.create(nextRun.toISOString())).fullDisplay}`);

            return nextRun;

        } catch (error) {
            Logger.error(`Failed to parse cron expression '${cronExpression}': ${error.message}`);

            // Fallback: add 1 minute to current Vietnam time
            const fallbackTime = VietnamTime.now().add(1, 'minute');
            Logger.info(`Using fallback time: ${VietnamTime.formatVN(fallbackTime).fullDisplay}`);

            return VietnamTime.toDate(fallbackTime);
        }
    }

    /**
     * Get next run time for a specific job
     * @param {number} cronJobId - Cron job ID
     * @returns {Date} - Next run time
     */
    async getNextRunTimeForJob(cronJobId) {
        try {
            const query = 'SELECT cron_expression FROM cron_jobs WHERE id = ?';
            const results = await Database.execute(query, [cronJobId]);

            if (results.length > 0) {
                const cronExpression = results[0].cron_expression;

                // Handle one-time jobs - they don't have a next run time
                if (cronExpression === 'ONE_TIME_JOB') {
                    return null;
                }

                return this.getNextRunTime(cronExpression);
            }

            return null;
        } catch (error) {
            Logger.error(`Failed to get next run time for job ${cronJobId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Enable/disable a cron job
     * @param {number} cronJobId - Cron job ID
     * @param {boolean} enabled - Whether to enable or disable
     */
    async toggleCronJob(cronJobId, enabled) {
        try {
            const query = 'UPDATE cron_jobs SET enabled = ? WHERE id = ?';
            await Database.execute(query, [enabled, cronJobId]);

            if (enabled) {
                await this.startCronJob(cronJobId);
                Logger.info(`✅ Enabled cron job ID: ${cronJobId}`);
            } else {
                this.stopCronJob(cronJobId);
                Logger.info(`⏸️ Disabled cron job ID: ${cronJobId}`);
            }

        } catch (error) {
            Logger.error(`❌ Failed to toggle cron job ${cronJobId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Delete a cron job
     * @param {number} cronJobId - Cron job ID
     */
    async deleteCronJob(cronJobId) {
        try {
            // Stop the job first
            this.stopCronJob(cronJobId);

            // Delete from database
            const query = 'DELETE FROM cron_jobs WHERE id = ?';
            const result = await Database.execute(query, [cronJobId]);

            if (result.affectedRows > 0) {
                Logger.success(`✅ Deleted cron job ID: ${cronJobId}`);
            } else {
                Logger.warn(`Cron job with ID ${cronJobId} not found`);
            }

        } catch (error) {
            Logger.error(`❌ Failed to delete cron job ${cronJobId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all cron jobs
     * @param {boolean} activeOnly - Whether to return only active jobs
     * @returns {Array} - Array of cron job data
     */
    async getAllCronJobs(activeOnly = false) {
        try {
            let query = 'SELECT * FROM cron_jobs';

            if (activeOnly) {
                query += ' WHERE enabled = TRUE';
            }

            query += ' ORDER BY name';

            const cronJobs = await Database.execute(query);

            // Add runtime status
            return cronJobs.map(job => ({
                ...job,
                isRunning: this.activeCronJobs.has(job.id)
            }));

        } catch (error) {
            Logger.error(`❌ Failed to get cron jobs: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get cron job execution logs
     * @param {number} cronJobId - Cron job ID (optional)
     * @param {number} limit - Number of logs to return
     * @returns {Array} - Array of execution logs
     */
    async getCronJobLogs(cronJobId = null, limit = 50) {
        try {
            let query = `
                SELECT cl.*, cj.name as job_name
                FROM cron_logs cl
                JOIN cron_jobs cj ON cl.cron_job_id = cj.id
            `;
            let params = [];

            if (cronJobId) {
                query += ' WHERE cl.cron_job_id = ?';
                params.push(cronJobId);
            }

            query += ' ORDER BY cl.execution_time DESC LIMIT ?';
            params.push(limit);

            return await Database.execute(query, params);

        } catch (error) {
            Logger.error(`❌ Failed to get cron job logs: ${error.message}`);
            throw error;
        }
    }

    /**
     * Stop all active cron jobs
     */
    stopAllCronJobs() {
        Logger.info('Stopping all active cron jobs...');

        for (const [cronJobId] of this.activeCronJobs) {
            this.stopCronJob(cronJobId);
        }

        Logger.success('✅ All cron jobs stopped');
    }

    /**
     * Get cron job statistics
     * @returns {Object} - Statistics object
     */
    async getStats() {
        try {
            const stats = {};

            // Total jobs
            const [totalJobs] = await Database.execute('SELECT COUNT(*) as count FROM cron_jobs');
            stats.totalJobs = totalJobs.count;

            // Active jobs
            const [activeJobs] = await Database.execute('SELECT COUNT(*) as count FROM cron_jobs WHERE enabled = TRUE');
            stats.activeJobs = activeJobs.count;

            // Running jobs
            stats.runningJobs = this.activeCronJobs.size;

            // Executions today
            const [todayExecutions] = await Database.execute(`
                SELECT COUNT(*) as count FROM cron_logs 
                WHERE DATE(execution_time) = CURDATE()
            `);
            stats.executionsToday = todayExecutions.count;

            // Success rate today
            const [todaySuccess] = await Database.execute(`
                SELECT COUNT(*) as count FROM cron_logs 
                WHERE DATE(execution_time) = CURDATE() AND status = 'success'
            `);
            stats.successRateToday = stats.executionsToday > 0
                ? Math.round((todaySuccess.count / stats.executionsToday) * 100)
                : 0;

            return stats;

        } catch (error) {
            Logger.error(`Failed to get cron job stats: ${error.message}`);
            return {};
        }
    }

    /**
     * Health check for NodeCron helper
     * @returns {Object} - Health check result
     */
    healthCheck() {
        const issues = [];

        if (!this.initialized) {
            issues.push('NodeCron helper not initialized');
        }

        if (this.activeCronJobs.size === 0) {
            issues.push('No active cron jobs running');
        }

        return {
            healthy: issues.length === 0,
            issues: issues,
            activeCronJobs: this.activeCronJobs.size,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new NodeCron();