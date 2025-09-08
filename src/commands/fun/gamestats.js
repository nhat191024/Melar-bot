const { EmbedBuilder } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class StatsCommand extends BaseCommand {
    constructor() {
        super({
            name: 'gamestats',
            description: 'View your game statistics',
            category: 'fun',
            module: 'fun',
            cooldown: 5
        });
    }

    getSlashCommandData() {
        return super.getSlashCommandData()
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('View stats for another user')
                    .setRequired(false)
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

        const targetUser = interaction.options.getUser('user') || interaction.user;

        try {
            await interaction.deferReply();

            const stats = await funModule.getUserStats(targetUser.id);

            const winRate = stats.games_played > 0
                ? ((stats.games_won / stats.games_played) * 100).toFixed(1)
                : '0.0';

            const avgScore = stats.games_played > 0
                ? (stats.total_score / stats.games_played).toFixed(1)
                : '0.0';

            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle(`🎮 Game Statistics`)
                .setDescription(`Statistics for ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: 'Games Played', value: stats.games_played.toString(), inline: true },
                    { name: 'Games Won', value: stats.games_won.toString(), inline: true },
                    { name: 'Win Rate', value: `${winRate}%`, inline: true },
                    { name: 'Total Score', value: stats.total_score.toString(), inline: true },
                    { name: 'Average Score', value: avgScore, inline: true },
                    { name: 'Best Score', value: stats.best_score.toString(), inline: true },
                    { name: 'Last Played', value: stats.last_played ? new Date(stats.last_played).toLocaleDateString() : 'Never', inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching game stats:', error);
            await interaction.editReply({
                content: 'Error fetching game statistics. Please try again later.',
                ephemeral: true
            });
        }
    }
}

module.exports = StatsCommand;
