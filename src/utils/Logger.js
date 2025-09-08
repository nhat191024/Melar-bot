const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logsDir = path.join(__dirname, '../../logs');
        this.ensureLogsDirectory();

        // Color schemes for different log levels
        this.colors = {
            info: '#3498DB',      // Blue
            success: '#2ECC71',   // Green
            warn: '#F39C12',      // Orange
            error: '#E74C3C',     // Red
            debug: '#9B59B6',     // Purple
            timestamp: '#95A5A6'  // Gray
        };
    }

    ensureLogsDirectory() {
        try {
            if (!fs.existsSync(this.logsDir)) {
                fs.mkdirSync(this.logsDir, { recursive: true });
            }
        } catch (error) {
            console.error(`Failed to create logs directory: ${error.message}`);
        }
    }

    formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }

    formatColoredMessage(level, message) {
        const timestamp = new Date().toISOString();

        // ANSI color codes for terminal
        const timestampAnsi = `\x1b[90m[${timestamp}]\x1b[0m`; // Gray
        const levelAnsi = this.getLevelAnsi(level);
        const messageAnsi = `\x1b[0m${message}\x1b[0m`; // Reset

        return `${timestampAnsi} ${levelAnsi} ${messageAnsi}`;
    }

    getLevelAnsi(level) {
        const ansiCodes = {
            info: '\x1b[36m[INFO]\x1b[0m',      // Cyan
            success: '\x1b[32m[SUCCESS]\x1b[0m', // Green
            warn: '\x1b[33m[WARN]\x1b[0m',      // Yellow
            error: '\x1b[31m[ERROR]\x1b[0m',    // Red
            debug: '\x1b[35m[DEBUG]\x1b[0m'     // Magenta
        };
        return ansiCodes[level] || ansiCodes.info;
    }

    log(level, message) {
        const formattedMessage = this.formatMessage(level, message);
        const coloredMessage = this.formatColoredMessage(level, message);

        // Print colored message to console
        console.log(coloredMessage);

        // Write plain message to file with error handling
        try {
            const logFile = path.join(this.logsDir, `${new Date().toISOString().split('T')[0]}.log`);
            fs.appendFileSync(logFile, formattedMessage + '\n');
        } catch (error) {
            // If we can't write to file, just continue with console logging
            console.error(`Failed to write to log file: ${error.message}`);
        }
    }

    info(message) {
        this.log('info', `ℹ️  ${message}`);
    }

    warn(message) {
        this.log('warn', `⚠️  ${message}`);
    }

    error(message) {
        this.log('error', `❌ ${message}`);
    }

    debug(message) {
        this.log('debug', `🔍 ${message}`);
    }

    success(message) {
        this.log('success', `✅ ${message}`);
    }

    // Special logging methods with custom formatting
    module(message) {
        this.log('info', `📦 ${message}`);
    }

    command(message) {
        this.log('info', `⚡ ${message}`);
    }

    event(message) {
        this.log('info', `🎯 ${message}`);
    }

    discord(message) {
        this.log('info', `🤖 ${message}`);
    }

    loading(message) {
        this.log('info', `⏳ ${message}`);
    }

    // Method for startup banner
    banner(lines) {
        console.log('\x1b[36m' + '='.repeat(60) + '\x1b[0m');
        lines.forEach(line => {
            console.log('\x1b[36m' + line.padStart((60 + line.length) / 2).padEnd(60) + '\x1b[0m');
        });
        console.log('\x1b[36m' + '='.repeat(60) + '\x1b[0m');
    }
}

module.exports = new Logger();
