const { Client, GatewayIntentBits, Collection } = require('discord.js');
const Config = require('./utils/Config');
const Logger = require('./utils/Logger');
const ModuleManager = require('./utils/ModuleManager');
const Database = require('./utils/Database');

class DiscordBot extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessageReactions
            ]
        });

        this.config = Config;
        this.logger = Logger;
        this.moduleManager = new ModuleManager(this);
        this.database = Database;
    }

    async start() {
        try {
            // Show startup banner
            Logger.banner([
                'Discord Bot - Modular Architecture',
                'Built with Discord.js v14',
                '🤖 Starting Bot...'
            ]);

            Logger.loading('Initializing bot systems...');

            // Validate environment configuration
            Config.validate();

            // Initialize database connection
            await Database.initialize();

            // Cleanup existing handlers (important for development with --watch)
            this.moduleManager.cleanup();

            // Load modules first
            await this.moduleManager.loadModules();

            // Load commands and events
            await this.moduleManager.loadCommands();
            await this.moduleManager.loadEvents();

            // Login to Discord only if not already logged in
            if (!this.isReady()) {
                Logger.discord('-------------------- Connecting to Discord... --------------------');
                await this.login(Config.get('token'));
            } else {
                Logger.discord('Bot is already logged in, skipping login');
                // Manually trigger slash command registration since we skipped login
                await this.moduleManager.registerSlashCommands();
            }

            Logger.success('🎉 Bot started successfully!');
        } catch (error) {
            Logger.error(`Failed to start bot: ${error.message}`);
            process.exit(1);
        }
    }

    async handleInteraction(interaction) {
        if (!interaction.isChatInputCommand()) return;

        const command = this.moduleManager.getCommand(interaction.commandName);

        if (!command) {
            await interaction.reply({ content: 'Command not found!', ephemeral: true });
            return;
        }

        // Check if command is enabled
        if (!command.enabled) {
            await interaction.reply({ content: 'This command is currently disabled!', ephemeral: true });
            return;
        }

        // Check if module is enabled
        if (!this.moduleManager.isModuleEnabled(command.module)) {
            await interaction.reply({ content: 'This command\'s module is currently disabled!', ephemeral: true });
            return;
        }

        // Check permissions
        if (interaction.guild && !command.hasPermissions(interaction.member)) {
            await interaction.reply({ content: 'You don\'t have permission to use this command!', ephemeral: true });
            return;
        }

        // Check cooldown
        const cooldownLeft = command.checkCooldown(interaction.user.id, this.moduleManager.cooldowns);
        if (cooldownLeft) {
            await interaction.reply({
                content: `Please wait ${cooldownLeft.toFixed(1)} seconds before using this command again.`,
                ephemeral: true
            });
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            Logger.error(`Error executing command ${command.name}: ${error.message}`);

            const errorMessage = { content: 'There was an error while executing this command!', ephemeral: true };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
}

module.exports = DiscordBot;
