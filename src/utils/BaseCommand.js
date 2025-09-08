const { SlashCommandBuilder, InteractionType } = require('discord.js');
const Config = require('../utils/Config');

class BaseCommand {
    constructor(options = {}) {
        this.name = options.name || 'unknown';
        this.description = options.description || 'No description provided';
        this.category = options.category || 'general';
        this.permissions = options.permissions || [];
        this.cooldown = options.cooldown || 3;
        this.guildOnly = options.guildOnly || false;
        this.ownerOnly = options.ownerOnly || false;
        this.enabled = options.enabled !== false;
        this.module = options.module || 'core';
    }

    // Override this method in your commands
    async execute(interaction) {
        throw new Error(`Command ${this.name} does not have an execute method`);
    }

    // Build slash command data
    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description);
    }

    // Check if user has required permissions
    hasPermissions(member) {
        if (this.permissions.length === 0) return true;
        return this.permissions.every(permission =>
            member.permissions.has(permission)
        );
    }

    // Check cooldown
    checkCooldown(userId, cooldowns) {
        if (!cooldowns.has(this.name)) {
            cooldowns.set(this.name, new Map());
        }

        const now = Date.now();
        const timestamps = cooldowns.get(this.name);
        const cooldownAmount = this.cooldown * 1000;

        if (timestamps.has(userId)) {
            const expirationTime = timestamps.get(userId) + cooldownAmount;

            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return timeLeft;
            }
        }

        timestamps.set(userId, now);
        setTimeout(() => timestamps.delete(userId), cooldownAmount);
        return null;
    }

    // Helper methods to detect command type
    isSlashCommand(interaction) {
        if (typeof interaction.isCommand !== 'function') return false;
        return interaction.isCommand();
    }

    isPrefixCommand(interaction) {
        if (typeof interaction.isCommand !== 'function') return true;
        return !interaction.isCommand();
    }

    // Get prefix command usage (override in commands that need custom usage)
    getPrefixUsage() {
        return `${this.name}`;
    }

    getPrefix() {
        return Config.get('prefix');
    }
}

module.exports = BaseCommand;
