const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class SettingsCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'xfixer_settings';
        this.description = 'Manage XFixer settings for this server';
        this.category = 'XFixer';
        this.module = 'xFixer';
        this.cooldown = 30;
        this.permissions = [PermissionFlagsBits.ManageChannels];
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addSubcommand(subcommand =>
                subcommand
                    .setName('view')
                    .setDescription('View current XFixer settings'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('delete-original')
                    .setDescription('Set whether to delete original messages with X.com links')
                    .addBooleanOption(option =>
                        option.setName('enabled')
                            .setDescription('True to delete original messages, false to keep them')
                            .setRequired(true)))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);
    }

    async execute(interaction) {
        try {
            if (this.isSlashCommand(interaction)) {
                const subcommand = interaction.options.getSubcommand();

                if (subcommand === 'view') {
                    return await this.handleView(interaction);
                } else if (subcommand === 'delete-original') {
                    const enabled = interaction.options.getBoolean('enabled');
                    return await this.handleDeleteOriginal(interaction, enabled);
                }
            } else {
                // Prefix command: !xfixer-settings [view|delete-original] [true/false]
                const commandArgs = interaction._args || [];

                if (commandArgs.length === 0 || commandArgs[0] === 'view') {
                    return await this.handleView(interaction);
                } else if (commandArgs[0] === 'delete-original') {
                    if (commandArgs.length < 2) {
                        return await interaction.reply({
                            content: '❌ Cách dùng: `!xfixer-settings delete-original true/false`',
                            ephemeral: true
                        });
                    }

                    const enabled = commandArgs[1].toLowerCase() === 'true';
                    return await this.handleDeleteOriginal(interaction, enabled);
                } else {
                    return await interaction.reply({
                        content: '❌ Cách dùng: `!xfixer-settings [view|delete-original]`',
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Error in xfixer settings command:', error);
            return await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi quản lý cài đặt XFixer.',
                ephemeral: true
            });
        }
    }

    async handleView(interaction) {
        // Get the XFixer module
        const xFixerModule = interaction.client.moduleManager.modules.get('xFixer');
        if (!xFixerModule) {
            return await interaction.reply({
                content: '❌ Module XFixer chưa được khởi chạy!',
                ephemeral: true
            });
        }

        // Get current settings
        const settings = await xFixerModule.getGuildSettings(interaction.guild.id);
        const excludedChannels = await xFixerModule.getExcludedChannels(interaction.guild.id);

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Cài đặt XFixer')
            .setDescription(`Cài đặt hiện tại cho **${interaction.guild.name}**`)
            .setColor(0x1DA1F2)
            .setTimestamp()
            .setFooter({ text: `${interaction.guild.name}`, iconURL: interaction.guild.iconURL() });

        embed.addFields(
            {
                name: '🗑️ Xóa tin nhắn gốc',
                value: settings.delete_original ? '✅ Bật' : '❌ Tắt',
                inline: true
            },
            {
                name: '📊 Thống kê',
                value: `🔗 Links đã sửa: ${xFixerModule.linksFixed || 0}\n` +
                    `🚫 Kênh loại trừ: ${excludedChannels.length}`,
                inline: true
            },
            {
                name: '📅 Cập nhật',
                value: settings.updated_at ?
                    `<t:${Math.floor(new Date(settings.updated_at).getTime() / 1000)}:R>` :
                    'Chưa có thay đổi',
                inline: true
            }
        );

        embed.addFields({
            name: '💡 Hướng dẫn',
            value: '• `/xfixer_settings delete-original true/false` - Bật/tắt xóa tin nhắn gốc\n' +
                '• `/xfixer_exclude #kênh` - Loại trừ kênh\n' +
                '• `/xfixer_include #kênh` - Bao gồm kênh\n' +
                '• `/xfixer_list` - Xem kênh loại trừ',
            inline: false
        });

        return await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }

    async handleDeleteOriginal(interaction, enabled) {
        // Get the XFixer module
        const xFixerModule = interaction.client.moduleManager.modules.get('xFixer');
        if (!xFixerModule) {
            return await interaction.reply({
                content: '❌ Module XFixer chưa được khởi chạy!',
                ephemeral: true
            });
        }

        // Update the setting
        const success = await xFixerModule.setDeleteOriginal(interaction.guild.id, enabled);

        if (success) {
            const statusText = enabled ? 'bật' : 'tắt';
            const emoji = enabled ? '✅' : '❌';

            return await interaction.reply({
                content: `${emoji} **Đã ${statusText} tính năng xóa tin nhắn gốc!**\n\n` +
                    `📝 **Trạng thái:** ${enabled ? 'Tin nhắn gốc sẽ bị xóa' : 'Tin nhắn gốc sẽ được giữ lại'}\n\n` +
                    `Cài đặt này áp dụng cho tất cả kênh trong server (trừ kênh loại trừ).`,
                ephemeral: true
            });
        } else {
            return await interaction.reply({
                content: '❌ Không thể cập nhật cài đặt. Vui lòng thử lại.',
                ephemeral: true
            });
        }
    }
}

module.exports = SettingsCommand;
