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
    }

    async handleButtonInteraction(interaction) {
        // Handle fun module button interactions
        if (interaction.customId.startsWith('guess_')) {
            const funModule = interaction.client.moduleManager.getModule('fun');
            if (!funModule) return;

            await this.handleGuessGame(interaction, funModule);
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
