const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class NumberGuessCommand extends BaseCommand {
    constructor() {
        super({
            name: 'guess',
            description: 'Play a number guessing game',
            category: 'fun',
            module: 'fun',
            cooldown: 10
        });
    }

    getSlashCommandData() {
        return super.getSlashCommandData()
            .addIntegerOption(option =>
                option.setName('max')
                    .setDescription('Maximum number to guess (default: 10)')
                    .setRequired(false)
                    .setMinValue(5)
                    .setMaxValue(100)
            );
    }

    async execute(interaction) {
        const funModule = interaction.client.moduleManager.getModule('fun');

        if (!funModule) {
            await interaction.reply({
                content: 'Fun module is not loaded!',
                ephemeral: true
            });
            return;
        }

        // Check if game is already active in this channel
        if (funModule.isGameActive(interaction.channelId)) {
            await interaction.reply({
                content: 'A game is already active in this channel! Finish it first.',
                ephemeral: true
            });
            return;
        }

        const maxNumber = interaction.options.getInteger('max') || 10;
        const secretNumber = Math.floor(Math.random() * maxNumber) + 1;
        const maxAttempts = Math.ceil(Math.log2(maxNumber)) + 2; // Fair number of attempts

        // Start the game
        funModule.startGame(interaction.channelId, 'number_guess', {
            secretNumber,
            maxNumber,
            attempts: 0,
            maxAttempts,
            playerId: interaction.user.id,
            startTime: Date.now()
        });

        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('🎯 Number Guessing Game')
            .setDescription(`I'm thinking of a number between 1 and ${maxNumber}!\nYou have ${maxAttempts} attempts to guess it.`)
            .addFields(
                { name: 'How to play', value: 'Use the buttons below to make your guess!' },
                { name: 'Attempts left', value: `${maxAttempts}`, inline: true },
                { name: 'Range', value: `1 - ${maxNumber}`, inline: true }
            )
            .setFooter({ text: `Game started by ${interaction.user.username}` })
            .setTimestamp();

        // Create number buttons (for smaller ranges)
        const rows = [];
        if (maxNumber <= 20) {
            for (let i = 0; i < Math.ceil(maxNumber / 5); i++) {
                const row = new ActionRowBuilder();
                for (let j = 1; j <= 5 && (i * 5 + j) <= maxNumber; j++) {
                    const number = i * 5 + j;
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`guess_${number}`)
                            .setLabel(number.toString())
                            .setStyle(ButtonStyle.Primary)
                    );
                }
                rows.push(row);
            }
        } else {
            // For larger ranges, provide hint buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('guess_hint')
                        .setLabel('Get Hint')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('guess_quit')
                        .setLabel('Quit Game')
                        .setStyle(ButtonStyle.Danger)
                );
            rows.push(row);

            embed.addFields({
                name: 'Large Range Mode',
                value: 'Type your guess as a message or use buttons for hints!'
            });
        }

        await interaction.reply({ embeds: [embed], components: rows });

        // Set up message collector for number input (for larger ranges)
        if (maxNumber > 20) {
            const filter = m => m.author.id === interaction.user.id && !isNaN(m.content);
            const collector = interaction.channel.createMessageCollector({
                filter,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (message) => {
                const game = funModule.getActiveGame(interaction.channelId);
                if (!game || game.type !== 'number_guess') {
                    collector.stop();
                    return;
                }

                const guess = parseInt(message.content);
                await this.processGuess(interaction, guess, funModule);

                if (!funModule.isGameActive(interaction.channelId)) {
                    collector.stop();
                }
            });

            collector.on('end', () => {
                if (funModule.isGameActive(interaction.channelId)) {
                    funModule.endGame(interaction.channelId);
                    interaction.followUp('⏰ Game timed out! The game has ended.');
                }
            });
        }
    }

    async processGuess(interaction, guess, funModule) {
        const game = funModule.getActiveGame(interaction.channelId);
        if (!game) return;

        game.attempts++;
        const { secretNumber, maxAttempts, maxNumber } = game;

        let resultEmbed;
        let gameEnded = false;

        if (guess === secretNumber) {
            // Correct guess!
            const score = Math.max(100 - (game.attempts - 1) * 10, 10);
            const duration = Math.floor((Date.now() - game.startTime) / 1000);

            await funModule.updateUserStats(interaction.user.id, interaction.user.username, {
                won: true,
                score: score,
                gameType: 'number_guess',
                attempts: game.attempts,
                duration: duration
            });

            resultEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎉 Congratulations!')
                .setDescription(`You guessed it! The number was **${secretNumber}**.`)
                .addFields(
                    { name: 'Attempts used', value: `${game.attempts}/${maxAttempts}`, inline: true },
                    { name: 'Score', value: `${score} points`, inline: true }
                )
                .setFooter({ text: `Great job, ${interaction.user.username}!` });

            gameEnded = true;
        } else if (game.attempts >= maxAttempts) {
            // Out of attempts
            const duration = Math.floor((Date.now() - game.startTime) / 1000);

            await funModule.updateUserStats(interaction.user.id, interaction.user.username, {
                won: false,
                score: 0,
                gameType: 'number_guess',
                attempts: game.attempts,
                duration: duration
            });

            resultEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('😞 Game Over!')
                .setDescription(`You're out of attempts! The number was **${secretNumber}**.`)
                .addFields(
                    { name: 'Attempts used', value: `${game.attempts}/${maxAttempts}`, inline: true }
                )
                .setFooter({ text: 'Better luck next time!' });

            gameEnded = true;
        } else {
            // Wrong guess, give hint
            const hint = guess < secretNumber ? 'higher' : 'lower';
            const attemptsLeft = maxAttempts - game.attempts;

            resultEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('🤔 Try Again!')
                .setDescription(`**${guess}** is too ${hint}! Try a ${hint} number.`)
                .addFields(
                    { name: 'Attempts left', value: `${attemptsLeft}`, inline: true },
                    { name: 'Range', value: `1 - ${maxNumber}`, inline: true }
                )
                .setFooter({ text: 'Keep trying!' });
        }

        if (gameEnded) {
            funModule.endGame(interaction.channelId);
        }

        await interaction.followUp({ embeds: [resultEmbed] });
    }
}

module.exports = NumberGuessCommand;
