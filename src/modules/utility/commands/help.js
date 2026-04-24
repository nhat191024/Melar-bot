const { EmbedBuilder } = require('discord.js');
const BaseCommand = require('../../../utils/BaseCommand');

class HelpCommand extends BaseCommand {
    constructor() {
        super({
            name: 'help',
            description: 'Display help information',
            category: 'utility',
            module: 'core'
        });
    }

    getSlashCommandData() {
        return super.getSlashCommandData()
            .addStringOption(option =>
                option.setName('command')
                    .setDescription('Get help for a specific command')
                    .setRequired(false)
            );
    }

    async execute(interaction) {
        const commandName = interaction.options.getString('command');
        const { moduleManager } = interaction.client;

        if (commandName) {
            // Get command name from prefix args if it's a prefix command
            const actualCommandName = this.isPrefixCommand(interaction)
                ? interaction._args[0]
                : commandName;

            const command = moduleManager.getCommand(actualCommandName || commandName);

            if (!command) {
                await interaction.reply({ content: 'Không tìm thấy lệnh này!', ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`Trợ giúp: ${command.name}`)
                .setDescription(command.description)
                .addFields(
                    { name: 'Danh mục', value: command.category, inline: true },
                    { name: 'Module', value: command.module, inline: true },
                    { name: 'Thời gian chờ', value: `${command.cooldown}s`, inline: true }
                );

            // Add usage information based on command type
            if (this.isPrefixCommand(interaction)) {
                const prefix = require('../../../utils/Config').get('prefix');
                embed.addFields({ name: 'Cách dùng với tiền tố', value: `\`${prefix}${command.getPrefixUsage()}\`` });
            } else {
                embed.addFields({ name: 'Cách dùng với Slash', value: `\`/${command.name}\`` });
            }

            await interaction.reply({ embeds: [embed] });
        } else {
            const commands = Array.from(moduleManager.commands.values());
            const categories = {};

            commands.forEach(command => {
                if (!categories[command.category]) {
                    categories[command.category] = [];
                }
                categories[command.category].push(command.name);
            });

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📚 Menu trợ giúp')
                .setDescription('Đây là tất cả các lệnh bạn có thể sử dụng:');

            Object.keys(categories).forEach(category => {
                embed.addFields({
                    name: `${category.charAt(0).toUpperCase() + category.slice(1)}`,
                    value: categories[category].map(cmd => `\`${cmd}\``).join(', '),
                    inline: false
                });
            });

            // Add footer based on command type
            if (this.isPrefixCommand(interaction)) {
                const prefix = require('../../../utils/Config').get('prefix');
                embed.setFooter({ text: `Dùng ${prefix}help <lệnh> để xem chi tiết | Tiền tố hiện tại: ${prefix}` });
            } else {
                embed.setFooter({ text: 'Dùng /help <lệnh> để xem chi tiết về một lệnh' });
            }

            await interaction.reply({ embeds: [embed] });
        }
    }
}

module.exports = HelpCommand;
