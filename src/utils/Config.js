require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

class Config {
    constructor() {
        // Cache for module states (since we can't persist to .env easily)
        this.moduleStates = new Map();
        this.moduleConfig = new Map();
        this.loadModuleConfig();
        this.loadModuleStates();
    }

    // Load module configuration from JSON file
    loadModuleConfig() {
        try {
            const configPath = path.join(process.cwd(), 'config', 'modules.json');

            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configData);

                // Store module configurations
                for (const [moduleName, moduleData] of Object.entries(config.modules)) {
                    this.moduleConfig.set(moduleName, moduleData);
                }

                // Store global settings
                this.moduleSettings = config.settings || {};

                console.log(`✅ Loaded ${Object.keys(config.modules).length} module configurations`);
            } else {
                console.warn('⚠️  Module configuration file not found. Creating default config...');
                this.createDefaultModuleConfig();
            }
        } catch (error) {
            console.error('❌ Failed to load module configuration:', error.message);
            console.log('📝 Using fallback configuration...');
            this.createFallbackConfig();
        }
    }

    // Create default module configuration file
    createDefaultModuleConfig() {
        try {
            const configDir = path.join(process.cwd(), 'config');
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            const defaultConfig = {
                modules: {},
                settings: {
                    autoLoadNewModules: true,
                    enabledByDefault: true,
                    allowRuntimeToggle: true
                }
            };

            const configPath = path.join(configDir, 'modules.json');
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));

            // Load the created config
            for (const [moduleName, moduleData] of Object.entries(defaultConfig.modules)) {
                this.moduleConfig.set(moduleName, moduleData);
            }
            this.moduleSettings = defaultConfig.settings;

            console.log('✅ Created default module configuration file');
        } catch (error) {
            console.error('❌ Failed to create default config:', error.message);
            this.createFallbackConfig();
        }
    }

    // Fallback configuration in case file operations fail
    createFallbackConfig() {
        this.moduleSettings = { autoLoadNewModules: true, enabledByDefault: true, allowRuntimeToggle: true };
    }

    // Load module states from environment and JSON config
    loadModuleStates() {
        // Get all modules from config
        for (const [moduleName, moduleData] of this.moduleConfig) {
            // Priority: Environment variable > JSON config > default enabled
            let enabled = false; // default

            // Check JSON config first
            if (moduleData.hasOwnProperty('enabled')) {
                enabled = moduleData.enabled;
            }

            // Check environment variable (overrides JSON)
            const envKey = `MODULE_${moduleName}`;
            if (process.env[envKey] !== undefined) {
                enabled = process.env[envKey] !== 'false';
            }

            this.moduleStates.set(moduleName, enabled);
        }

        console.log(`📋 Loaded states for ${this.moduleStates.size} modules`);
    }

    get(key) {
        switch (key) {
            case 'token':
                return process.env.DISCORD_TOKEN;
            case 'prefix':
                return process.env.BOT_PREFIX || '!';
            case 'clientId':
                return process.env.DISCORD_CLIENT_ID;
            case 'guildId':
                return process.env.DISCORD_GUILD_ID;
            case 'environment':
                return process.env.NODE_ENV || 'development';
            default:
                return process.env[key.toUpperCase()];
        }
    }

    set(key, value) {
        // For environment variables, we can only update runtime values
        // Not persisted to .env file (would require manual editing)
        process.env[key.toUpperCase()] = value;
        console.warn(`⚠️  Config change for '${key}' is temporary. Update .env file for persistence.`);
    }

    isModuleEnabled(moduleName) {
        return this.moduleStates.get(moduleName) !== false;
    }

    enableModule(moduleName) {
        this.moduleStates.set(moduleName, true);
        console.log(`✅ Module '${moduleName}' enabled (runtime only)`);
    }

    disableModule(moduleName) {
        this.moduleStates.set(moduleName, false);
        console.log(`❌ Module '${moduleName}' disabled (runtime only)`);
    }

    // Get module configuration
    getModuleConfig(moduleName) {
        return this.moduleConfig.get(moduleName) || null;
    }

    // Get all modules
    getAllModules() {
        const modules = {};
        for (const [name, config] of this.moduleConfig) {
            modules[name] = {
                ...config,
                enabled: this.moduleStates.get(name) || false
            };
        }
        return modules;
    }

    // Add new module to configuration
    // addModule(moduleName, moduleData) {
    //     try {
    //         // Add to runtime config
    //         this.moduleConfig.set(moduleName, moduleData);
    //         this.moduleStates.set(moduleName, moduleData.enabled !== false);

    //         // Update JSON file
    //         this.updateModuleConfigFile();

    //         console.log(`✅ Added new module: ${moduleName}`);
    //         return true;
    //     } catch (error) {
    //         console.error(`❌ Failed to add module ${moduleName}:`, error.message);
    //         return false;
    //     }
    // }

    // Remove module from configuration
    removeModule(moduleName) {
        try {
            // Remove from runtime config
            this.moduleConfig.delete(moduleName);
            this.moduleStates.delete(moduleName);

            // Update JSON file
            this.updateModuleConfigFile();

            console.log(`🗑️ Removed module: ${moduleName}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to remove module ${moduleName}:`, error.message);
            return false;
        }
    }

    // Update module configuration file
    updateModuleConfigFile() {
        try {
            const configPath = path.join(process.cwd(), 'config', 'modules.json');

            const modules = {};
            for (const [name, config] of this.moduleConfig) {
                modules[name] = config;
            }

            const configData = {
                modules: modules,
                settings: this.moduleSettings
            };

            fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
            console.log('💾 Updated module configuration file');
        } catch (error) {
            console.error('❌ Failed to update config file:', error.message);
        }
    }

    // Toggle module state and update config
    toggleModule(moduleName, enabled) {
        const moduleData = this.moduleConfig.get(moduleName);
        if (moduleData) {
            moduleData.enabled = enabled;
            this.moduleStates.set(moduleName, enabled);
            this.updateModuleConfigFile();

            const status = enabled ? 'enabled' : 'disabled';
            console.log(`🔄 Module '${moduleName}' ${status} and saved to config`);
            return true;
        }
        return false;
    }

    // Get database configuration
    getDatabase() {
        return {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        };
    }

    // Validate required environment variables
    validate() {
        const required = ['DISCORD_TOKEN', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
        const missing = required.filter(key => !process.env[key]);

        if (missing.length > 0) {
            console.error('❌ Missing required environment variables:', missing);
            console.error('📝 Please check your .env file');
            process.exit(1);
        }
    }
}

module.exports = new Config();
