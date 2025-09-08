// Load environment variables
require('dotenv').config({ quiet: true });

// Suppress Node.js experimental warnings (optional)
process.removeAllListeners('warning');

const DiscordBot = require('./src/DiscordBot');
const Logger = require('./src/utils/Logger');

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    Logger.error(`Uncaught Exception: ${error.message}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    Logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

// Create and start the bot
const bot = new DiscordBot();
bot.start();
