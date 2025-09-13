const BaseEvent = require('../utils/BaseEvent');
const Logger = require('../utils/Logger');

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

        // Handle button interactions
        if (interaction.isButton()) {
            await this.handleButtonInteraction(interaction);
            return;
        }

        // Handle select menu interactions
        if (interaction.isStringSelectMenu()) {
            await this.handleSelectMenuInteraction(interaction);
            return;
        }
    }

    async handleButtonInteraction(interaction) {
        // Handle task list pagination buttons
        if (interaction.customId.startsWith('task_list_')) {
            const taskListCommand = interaction.client.moduleManager.getCommand('task_list');
            if (taskListCommand && await taskListCommand.handleButtonInteraction(interaction)) {
                return;
            }
        }

        // Handle task history pagination buttons
        if (interaction.customId.startsWith('task_history_')) {
            const taskHistoryCommand = interaction.client.moduleManager.getCommand('task_history');
            if (taskHistoryCommand && await taskHistoryCommand.handleButtonInteraction(interaction)) {
                return;
            }
        }

        // Handle fun module button interactions
        if (interaction.customId.startsWith('guess_')) {
            const funModule = interaction.client.moduleManager.getModule('fun');
            if (!funModule) return;

            await this.handleGuessGame(interaction, funModule);
        }
    }

    async handleSelectMenuInteraction(interaction) {
        // Handle task history status selection
        if (interaction.customId.startsWith('task_history_status_')) {
            const taskHistoryCommand = interaction.client.moduleManager.getCommand('task_history');
            if (taskHistoryCommand) {
                const targetUserId = interaction.customId.split('_')[3]; // Extract user ID from custom ID
                const selectedStatus = interaction.values[0];

                await interaction.deferUpdate();
                await taskHistoryCommand.handleStatusSelection(interaction, selectedStatus, targetUserId);
                return;
            }
        }

        // Handle task status update selection
        if (interaction.customId.startsWith('task_update_status_')) {
            const taskUpdateCommand = interaction.client.moduleManager.getCommand('task_update_status');
            if (taskUpdateCommand) {
                const taskId = parseInt(interaction.customId.split('_')[3]); // Extract task ID from custom ID
                const selectedStatus = interaction.values[0];

                await taskUpdateCommand.handleStatusUpdate(interaction, taskId, selectedStatus);
                return;
            }
        }
    }

    async handleGuessGame(interaction, funModule) {
        const game = funModule.getActiveGame(interaction.channelId);

        if (!game || game.type !== 'number_guess') {
            await interaction.reply({
                content: 'No active guessing game in this channel!',
                ephemeral: true
            });
            return;
        }

        // Check if it's the right player
        if (game.playerId !== interaction.user.id) {
            await interaction.reply({
                content: 'This is not your game!',
                ephemeral: true
            });
            return;
        }

        const action = interaction.customId.split('_')[1];

        if (action === 'quit') {
            funModule.endGame(interaction.channelId);
            await interaction.reply('🏃‍♂️ You quit the game! The game has ended.');
            return;
        }

        if (action === 'hint') {
            const { secretNumber, maxNumber } = game;
            const isHigh = secretNumber > maxNumber / 2;
            const hint = isHigh ? 'higher half' : 'lower half';

            await interaction.reply({
                content: `💡 Hint: The number is in the ${hint} of the range!`,
                ephemeral: true
            });
            return;
        }

        // Handle number guess
        const guess = parseInt(action);
        if (isNaN(guess)) return;

        await interaction.deferReply();

        // Use the same processing logic as the slash command
        const guessCommand = interaction.client.moduleManager.getCommand('guess');
        if (guessCommand) {
            await guessCommand.processGuess(interaction, guess, funModule);
        }
    }
}

module.exports = InteractionCreateEvent;
