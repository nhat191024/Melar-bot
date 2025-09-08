const { EmbedBuilder } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');
const Database = require('../../utils/Database');

class LeaderboardCommand extends BaseCommand {
    constructor() {
        super({
            name: 'leaderboard',
            description: 'View the game leaderboard',
            category: 'fun',
            module: 'fun',
            cooldown: 10
        });
    }

    getSlashCommandData() {
        return super.getSlashCommandData()
            .addStringOption(option =>
                option.setName('game')
                    .setDescription('Show leaderboard for a specific game')
                    .setRequired(false)
                    .addChoices(
                        { name: 'Number Guessing', value: 'number_guess' },
                        { name: 'All Games', value: 'all' }
                    )
            )
            .addIntegerOption(option =>
                option.setName('limit')
                    .setDescription('Number of top players to show (1-20)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(20)
            );
    }

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const gameType = interaction.options.getString('game') === 'all' ? null : interaction.options.getString('game');
            const limit = interaction.options.getInteger('limit') || 10;

            const topPlayers = await Database.getTopPlayers(gameType, limit);

            if (!topPlayers || topPlayers.length === 0) {
                await interaction.editReply({
                    content: 'No players found on the leaderboard yet. Start playing some games!',
                    ephemeral: true
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🏆 Game Leaderboard')
                .setDescription(gameType ? `Top players for ${gameType.replace('_', ' ')}` : 'Top players across all games')
                .setTimestamp();

            let leaderboardText = '';
            for (let i = 0; i < topPlayers.length; i++) {
                const player = topPlayers[i];
                const position = i + 1;
                const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;

                if (gameType) {
                    leaderboardText += `${medal} **${player.username}**\n`;
                    leaderboardText += `   Games: ${player.games_played || 0} | Won: ${player.games_won || 0} | Best: ${player.best_score || 0}\n\n`;
                } else {
                    leaderboardText += `${medal} **${player.username}**\n`;
                    leaderboardText += `   Games: ${player.games_played} | Won: ${player.games_won} | Score: ${player.best_score}\n\n`;
                }
            }

            embed.setDescription(`${embed.data.description}\n\n${leaderboardText}`);

            // Add summary footer
            const totalPlayers = topPlayers.length;
            const totalGames = topPlayers.reduce((sum, p) => sum + (p.games_played || 0), 0);

            embed.setFooter({
                text: `Showing ${totalPlayers} players • ${totalGames} total games played`,
                iconURL: interaction.client.user.displayAvatarURL()
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            await interaction.editReply({
                content: 'Error fetching leaderboard. Please try again later.',
                ephemeral: true
            });
        }
    }

    async executePrefix(message, args) {
        try {
            const gameType = args[0] === 'all' ? null : args[0];
            const limit = parseInt(args[1]) || 10;

            if (limit < 1 || limit > 20) {
                await message.reply('Limit must be between 1 and 20.');
                return;
            }

            const topPlayers = await Database.getTopPlayers(gameType, limit);

            if (!topPlayers || topPlayers.length === 0) {
                await message.reply('No players found on the leaderboard yet. Start playing some games!');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🏆 Game Leaderboard')
                .setDescription(gameType ? `Top players for ${gameType.replace('_', ' ')}` : 'Top players across all games')
                .setTimestamp();

            let leaderboardText = '';
            for (let i = 0; i < topPlayers.length; i++) {
                const player = topPlayers[i];
                const position = i + 1;
                const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `${position}.`;

                if (gameType) {
                    leaderboardText += `${medal} **${player.username}**\n`;
                    leaderboardText += `   Games: ${player.games_played || 0} | Won: ${player.games_won || 0} | Best: ${player.best_score || 0}\n\n`;
                } else {
                    leaderboardText += `${medal} **${player.username}**\n`;
                    leaderboardText += `   Games: ${player.games_played} | Won: ${player.games_won} | Score: ${player.best_score}\n\n`;
                }
            }

            embed.setDescription(`${embed.data.description}\n\n${leaderboardText}`);

            const totalPlayers = topPlayers.length;
            const totalGames = topPlayers.reduce((sum, p) => sum + (p.games_played || 0), 0);

            embed.setFooter({
                text: `Showing ${totalPlayers} players • ${totalGames} total games played`,
                iconURL: message.client.user.displayAvatarURL()
            });

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            await message.reply('Error fetching leaderboard. Please try again later.');
        }
    }
}

module.exports = LeaderboardCommand;
