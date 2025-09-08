const { EmbedBuilder } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class PingCommand extends BaseCommand {
    constructor() {
        super({
            name: 'ping',
            description: 'Check bot latency',
            category: 'utility',
            module: 'core'
        });
    }

    getSlashCommandData() {
        return super.getSlashCommandData();
    }

    async execute(interaction) {
        if (this.isPrefixCommand(interaction)) {
            // Handle prefix command
            const sent = await interaction.reply('Đang kiểm tra độ trễ...');

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🏓 Pong!')
                .addFields(
                    { name: 'Độ trễ gửi nhận', value: `${sent.createdTimestamp - interaction.createdTimestamp}ms`, inline: true },
                    { name: 'Độ trễ Websocket', value: `${interaction.client.ws.ping}ms`, inline: true }
                )
                .setTimestamp();

            await interaction.followUp({ embeds: [embed] });
        } else {
            // Handle slash command (updated for Discord.js v14)
            await interaction.reply({ content: 'Đang kiểm tra độ trễ...' });
            const sent = await interaction.fetchReply();

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🏓 Pong!')
                .addFields(
                    { name: 'Độ trễ gửi nhận', value: `${sent.createdTimestamp - interaction.createdTimestamp}ms`, inline: true },
                    { name: 'Độ trễ Websocket', value: `${interaction.client.ws.ping}ms`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ content: null, embeds: [embed] });
        }
    }

    getPrefixUsage() {
        return `${this.name}`;
    }
}

module.exports = PingCommand;
