const { EmbedBuilder } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');
const Config = require('../../utils/Config');

class PrefixCommand extends BaseCommand {
    constructor() {
        super({
            name: 'prefix',
            description: 'Show current prefix or test prefix commands',
            category: 'utility',
            module: 'core'
        });
    }

    getSlashCommandData() {
        return super.getSlashCommandData()
            .addStringOption(option =>
                option.setName('action')
                    .setDescription('Action to perform')
                    .addChoices(
                        { name: 'Show current prefix', value: 'show' },
                        { name: 'Test prefix commands', value: 'test' }
                    )
                    .setRequired(false)
            );
    }

    async execute(interaction) {
        const action = interaction.options?.getString('action') || 'show';
        const currentPrefix = Config.get('prefix');

        if (action === 'test') {
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🧪 Kiểm tra lệnh tiền tố')
                .setDescription('Hãy thử các lệnh sau với tiền tố:')
                .addFields(
                    { name: 'Ping', value: `\`${currentPrefix}ping\``, inline: true },
                    { name: 'Trợ giúp', value: `\`${currentPrefix}help\``, inline: true },
                    { name: 'Xem tiền tố hiện tại', value: `\`${currentPrefix}prefix\``, inline: true }
                )
                .setFooter({ text: `Tiền tố hiện tại: ${currentPrefix}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('⚙️ Tiền tố của bot')
                .setDescription(`Tiền tố hiện tại: \`${currentPrefix}\``)
                .addFields(
                    { name: 'Cách sử dụng', value: `Gõ \`${currentPrefix}lệnh\` để dùng các lệnh tiền tố` },
                    { name: 'Ví dụ', value: `\`${currentPrefix}ping\`, \`${currentPrefix}help\`, \`${currentPrefix}joke\`` }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    }

    getPrefixUsage() {
        return `${this.name} [show|test]`;
    }
}

module.exports = PrefixCommand;
