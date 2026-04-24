const fs = require('fs');
const path = require('path');
const Logger = require('./Logger');
const Config = require('./Config');

class ModuleManager {
    constructor(client) {
        this.client = client;
        this.modules = new Map();
        this.commands = new Map();
        this.events = new Map();
        this.cooldowns = new Map();

        // Core modules that should always be enabled
        this.coreModules = ['core'];

        // Interaction handler registry: [{ customId, match, type, handler }]
        // type: 'button' | 'modal' | 'select'
        // match: 'startsWith' (default) | 'exact'
        this.interactionHandlers = [];
    }

    /**
     * Register an interaction handler for a specific customId.
     * Called by commands in their registerInteractionHandlers() method.
     * @param {object} config
     * @param {string} config.customId - The customId string to match
     * @param {'button'|'modal'|'select'} config.type - Interaction type
     * @param {'startsWith'|'exact'} [config.match='startsWith'] - Match strategy
     * @param {Function} config.handler - Async function(interaction) → true if handled
     */
    registerInteractionHandler({ customId, type, match = 'startsWith', handler }) {
        this.interactionHandlers.push({ customId, type, match, handler });
    }

    // Cleanup existing handlers before loading new ones
    cleanup() {
        // Remove all event listeners that we added
        for (const [eventName, eventInstance] of this.events) {
            this.client.removeAllListeners(eventName);
        }

        // Clear maps
        this.modules.clear();
        this.commands.clear();
        this.events.clear();
        this.cooldowns.clear();
        this.interactionHandlers = [];

        Logger.debug('Cleaned up existing handlers');
    }

    async loadModules() {
        const modulesPath = path.join(__dirname, '../modules');

        if (!fs.existsSync(modulesPath)) {
            Logger.warn('Modules directory not found, creating it...');
            fs.mkdirSync(modulesPath, { recursive: true });
            return;
        }

        const entries = fs.readdirSync(modulesPath, { withFileTypes: true });

        Logger.info('-------------------- Start loading modules --------------------');
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const moduleName = entry.name;
            const indexPath = path.join(modulesPath, moduleName, 'index.js');

            if (!fs.existsSync(indexPath)) continue;

            if (!this.isModuleEnabled(moduleName)) {
                Logger.info(`Module ${moduleName} is disabled, skipping...`);
                continue;
            }

            try {
                const ModuleClass = require(indexPath);
                const moduleInstance = new ModuleClass(this.client);

                this.modules.set(moduleName, moduleInstance);

                if (moduleInstance.load) {
                    await moduleInstance.load();
                }

                Logger.module(`Loaded module: ${moduleName}`);
            } catch (error) {
                Logger.error(`Failed to load module ${moduleName}: ${error.message}`);
            }
        }
    }

    async loadCommands() {
        Logger.info('-------------------- Start loading commands --------------------');

        const modulesPath = path.join(__dirname, '../modules');
        const coreCommandsPath = path.join(__dirname, '../core/commands');

        if (fs.existsSync(modulesPath)) {
            const moduleEntries = fs.readdirSync(modulesPath, { withFileTypes: true });
            for (const entry of moduleEntries) {
                if (!entry.isDirectory()) continue;
                const commandsPath = path.join(modulesPath, entry.name, 'commands');
                if (fs.existsSync(commandsPath)) {
                    await this.loadCommandsFromDirectory(commandsPath);
                }
            }
        }

        if (fs.existsSync(coreCommandsPath)) {
            await this.loadCommandsFromDirectory(coreCommandsPath);
        }
    }

    async loadCommandsFromDirectory(dirPath) {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            const stat = fs.statSync(itemPath);

            if (stat.isDirectory()) {
                await this.loadCommandsFromDirectory(itemPath);
            } else if (item.endsWith('.js')) {
                try {
                    const CommandClass = require(itemPath);
                    const commandInstance = new CommandClass();

                    if (!commandInstance.enabled) {
                        Logger.info(`Command ${commandInstance.name} is disabled, skipping...`);
                        continue;
                    }

                    if (!this.isModuleEnabled(commandInstance.module)) {
                        // Logger.info(`Command ${commandInstance.name} belongs to disabled module ${commandInstance.module}, skipping...`);
                        continue;
                    }

                    this.commands.set(commandInstance.name, commandInstance);
                    Logger.command(`Loaded command: ${commandInstance.name}`);

                    // Let command register its own interaction handlers
                    if (typeof commandInstance.registerInteractionHandlers === 'function') {
                        commandInstance.registerInteractionHandlers(this);
                    }
                } catch (error) {
                    Logger.error(`Failed to load command from ${itemPath}: ${error.message}`);
                }
            }
        }
    }

    async loadEvents() {
        const eventsPath = path.join(__dirname, '../core/events');

        if (!fs.existsSync(eventsPath)) {
            Logger.warn('Events directory not found, creating it...');
            fs.mkdirSync(eventsPath, { recursive: true });
            return;
        }

        const eventFiles = fs.readdirSync(eventsPath);

        Logger.info('-------------------- Start loading events --------------------');
        for (const eventFile of eventFiles) {
            if (!eventFile.endsWith('.js')) continue;

            try {
                const EventClass = require(path.join(eventsPath, eventFile));
                const eventInstance = new EventClass();

                if (!eventInstance.enabled) {
                    Logger.info(`Event ${eventInstance.name} is disabled, skipping...`);
                    continue;
                }

                if (!this.isModuleEnabled(eventInstance.module)) {
                    Logger.info(`Event ${eventInstance.name} belongs to disabled module ${eventInstance.module}, skipping...`);
                    continue;
                }

                // Check for duplicate events
                if (this.events.has(eventInstance.name)) {
                    Logger.warn(`Event ${eventInstance.name} already exists, skipping duplicate from ${eventFile}`);
                    continue;
                }

                this.events.set(eventInstance.name, eventInstance);

                if (eventInstance.once) {
                    this.client.once(eventInstance.name, (...args) => eventInstance.execute(...args));
                } else {
                    this.client.on(eventInstance.name, (...args) => eventInstance.execute(...args));
                }

                Logger.event(`Loaded event: ${eventInstance.name}`);
            } catch (error) {
                Logger.error(`Failed to load event from ${eventFile}: ${error.message}`);
            }
        }
    }

    async registerSlashCommands() {
        const { REST, Routes } = require('discord.js');
        const commands = [];

        for (const command of this.commands.values()) {
            commands.push(command.getSlashCommandData().toJSON());
        }
        Logger.info('-------------------- Start loading slash commands --------------------');
        Logger.loading(`Registering ${commands.length} slash commands...`);

        const rest = new REST().setToken(Config.get('token'));

        try {
            Logger.loading('Started refreshing application (/) commands.');

            if (Config.get('guildId')) {
                // Guild commands (for testing)
                await rest.put(
                    Routes.applicationGuildCommands(Config.get('clientId'), Config.get('guildId')),
                    { body: commands }
                );
                Logger.success(`Successfully reloaded ${commands.length} guild application (/) commands.`);
            } else {
                // Global commands
                await rest.put(
                    Routes.applicationCommands(Config.get('clientId')),
                    { body: commands }
                );
                Logger.success(`Successfully reloaded ${commands.length} global application (/) commands.`);
            }
        } catch (error) {
            Logger.error(`Failed to register slash commands: ${error.message}`);
        }
    }

    getCommand(name) {
        return this.commands.get(name);
    }

    getModule(name) {
        return this.modules.get(name);
    }

    async reloadModule(moduleName) {
        if (this.modules.has(moduleName)) {
            const module = this.modules.get(moduleName);
            if (module.unload) {
                await module.unload();
            }
            this.modules.delete(moduleName);
        }

        // Clear module cache
        const modulePath = path.join(__dirname, '../modules', moduleName, 'index.js');
        delete require.cache[require.resolve(modulePath)];

        try {
            const ModuleClass = require(modulePath);
            const moduleInstance = new ModuleClass(this.client);

            this.modules.set(moduleName, moduleInstance);

            if (moduleInstance.load) {
                await moduleInstance.load();
            }

            Logger.success(`Reloaded module: ${moduleName}`);
            return true;
        } catch (error) {
            Logger.error(`Failed to reload module ${moduleName}: ${error.message}`);
            return false;
        }
    }

    // Helper method to check if module should be enabled (including core modules)
    isModuleEnabled(moduleName) {
        // Core modules are always enabled
        if (this.coreModules.includes(moduleName)) {
            return true;
        }

        return Config.isModuleEnabled(moduleName);
    }
}

module.exports = ModuleManager;
