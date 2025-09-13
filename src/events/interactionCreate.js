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

        // Handle modal submissions
        if (interaction.isModalSubmit()) {
            await this.handleModalSubmit(interaction);
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

    async handleModalSubmit(interaction) {
        try {
            // Handle task add modal
            if (interaction.customId === 'task_add_modal') {
                const taskAddCommand = interaction.client.moduleManager.getCommand('task_add');
                if (taskAddCommand && typeof taskAddCommand.handleModalSubmit === 'function') {
                    await taskAddCommand.handleModalSubmit(interaction);
                    return;
                }
            }

            // Handle note add modal
            if (interaction.customId === 'note_add_modal') {
                const noteAddCommand = interaction.client.moduleManager.getCommand('note_add');
                if (noteAddCommand && typeof noteAddCommand.handleModalSubmit === 'function') {
                    await noteAddCommand.handleModalSubmit(interaction);
                    return;
                }
            }

            // If no command handled the modal, send a generic error
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi xử lý form.',
                ephemeral: true
            });

        } catch (error) {
            console.error('Error handling modal submit:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Đã xảy ra lỗi khi xử lý form.',
                    ephemeral: true
                });
            }
        }
    }
}

module.exports = InteractionCreateEvent;
