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

        Logger.debug('Cleaned up existing handlers');
    }

    async loadModules() {
        const modulesPath = path.join(__dirname, '../modules');

        if (!fs.existsSync(modulesPath)) {
            Logger.warn('Modules directory not found, creating it...');
            fs.mkdirSync(modulesPath, { recursive: true });
            return;
        }

        const moduleFiles = fs.readdirSync(modulesPath);

        Logger.info('-------------------- Start loading modules --------------------');
        for (const moduleFile of moduleFiles) {
            if (!moduleFile.endsWith('.js')) continue;

            const moduleName = path.basename(moduleFile, '.js');

            if (!this.isModuleEnabled(moduleName)) {
                Logger.info(`Module ${moduleName} is disabled, skipping...`);
                continue;
            }

            try {
                const ModuleClass = require(path.join(modulesPath, moduleFile));
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
        const commandsPath = path.join(__dirname, '../commands');

        if (!fs.existsSync(commandsPath)) {
            Logger.warn('Commands directory not found, creating it...');
            fs.mkdirSync(commandsPath, { recursive: true });
            return;
        }

        Logger.info('-------------------- Start loading commands --------------------');
        await this.loadCommandsFromDirectory(commandsPath);
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
                } catch (error) {
                    Logger.error(`Failed to load command from ${itemPath}: ${error.message}`);
                }
            }
        }
    }

    async loadEvents() {
        const eventsPath = path.join(__dirname, '../events');

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
        delete require.cache[require.resolve(`../modules/${moduleName}.js`)];

        try {
            const ModuleClass = require(`../modules/${moduleName}.js`);
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
