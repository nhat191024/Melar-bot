const BaseEvent = require('../../utils/BaseEvent');
const Logger = require('../../utils/Logger');

class InteractionCreateEvent extends BaseEvent {
    constructor() {
        super({
            name: 'interactionCreate',
            module: 'core'
        });
    }

    async execute(interaction) {
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            await interaction.client.handleInteraction(interaction);
            return;
        }

        // Handle modal submissions
        if (interaction.isModalSubmit()) {
            await this.dispatch(interaction, 'modal');
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Đã xảy ra lỗi khi xử lý form.',
                    ephemeral: true
                });
            }
            return;
        }

        // Handle button interactions
        if (interaction.isButton()) {
            await this.dispatch(interaction, 'button');
            return;
        }

        // Handle select menu interactions
        if (interaction.isStringSelectMenu()) {
            await this.dispatch(interaction, 'select');
            return;
        }
    }

    /**
     * Dispatch an interaction to the first registered handler that matches.
     * Handlers are registered by commands via registerInteractionHandlers().
     */
    async dispatch(interaction, type) {
        const handlers = interaction.client.moduleManager.interactionHandlers
            .filter(h => h.type === type && this._matches(h, interaction.customId));

        for (const h of handlers) {
            try {
                const result = await h.handler(interaction);
                // Stop after first handler that doesn't explicitly return false
                if (result !== false) return;
            } catch (error) {
                Logger.error(`Interaction handler error [${type}:${interaction.customId}]: ${error.message}`);
            }
        }
    }

    _matches(handler, customId) {
        if (handler.match === 'exact') return customId === handler.customId;
        return customId.startsWith(handler.customId);
    }
}

module.exports = InteractionCreateEvent;

