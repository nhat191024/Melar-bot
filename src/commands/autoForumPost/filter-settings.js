const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class FilterSettingsCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'autoforumpost_filter_settings';
        this.description = 'Manage content filtering settings for AutoForumPost';
        this.category = 'AutoForumPost';
        this.module = 'autoForumPost';
        this.cooldown = 5;
        this.permissions = [PermissionFlagsBits.ManageChannels];
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addSubcommand(subcommand =>
                subcommand
                    .setName('view')
                    .setDescription('View current content filtering settings'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('hashtag-filter')
                    .setDescription('Set whether to filter messages with only hashtags')
                    .addBooleanOption(option =>
                        option.setName('enabled')
                            .setDescription('True to filter hashtag-only messages, false to allow them')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('min-length')
                    .setDescription('Set minimum content length (excluding hashtags)')
                    .addIntegerOption(option =>
                        option.setName('length')
                            .setDescription('Minimum number of characters (excluding hashtags)')
                            .setMinValue(0)
                            .setMaxValue(50)
                            .setRequired(true)))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);
    }

    async execute(interaction) {
        try {
            if (this.isSlashCommand(interaction)) {
                const subcommand = interaction.options.getSubcommand();

                if (subcommand === 'view') {
                    return await this.handleView(interaction);
                } else if (subcommand === 'hashtag-filter') {
                    const enabled = interaction.options.getBoolean('enabled');
                    return await this.handleHashtagFilter(interaction, enabled);
                } else if (subcommand === 'min-length') {
                    const length = interaction.options.getInteger('length');
                    return await this.handleMinLength(interaction, length);
                }
            } else {
                // Prefix command: !autoforumpost-filter-settings [view|hashtag-filter|min-length] [value]
                const commandArgs = interaction._args || [];

                if (commandArgs.length === 0 || commandArgs[0] === 'view') {
                    return await this.handleView(interaction);
                } else if (commandArgs[0] === 'hashtag-filter') {
                    if (commandArgs.length < 2) {
                        return await interaction.reply({
                            content: '❌ Cách dùng: `!autoforumpost-filter-settings hashtag-filter true/false`',
                            ephemeral: true
                        });
                    }

                    const enabled = commandArgs[1].toLowerCase() === 'true';
                    return await this.handleHashtagFilter(interaction, enabled);
                } else if (commandArgs[0] === 'min-length') {
                    if (commandArgs.length < 2) {
                        return await interaction.reply({
                            content: '❌ Cách dùng: `!autoforumpost-filter-settings min-length <số>`',
                            ephemeral: true
                        });
                    }

                    const length = parseInt(commandArgs[1]);
                    if (isNaN(length) || length < 0 || length > 50) {
                        return await interaction.reply({
                            content: '❌ Độ dài tối thiểu phải là số từ 0 đến 50.',
                            ephemeral: true
                        });
                    }

                    return await this.handleMinLength(interaction, length);
                } else {
                    return await interaction.reply({
                        content: '❌ Cách dùng: `!autoforumpost-filter-settings [view|hashtag-filter|min-length]`',
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Error in autoforumpost filter settings command:', error);
            return await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi quản lý cài đặt lọc nội dung.',
                ephemeral: true
            });
        }
    }

    async handleView(interaction) {
        // Get the AutoForumPost module
        const autoForumModule = interaction.client.moduleManager.modules.get('autoForumPost');
        if (!autoForumModule) {
            return await interaction.reply({
                content: '❌ Module AutoForumPost chưa được khởi chạy!',
                ephemeral: true
            });
        }

        // Get current settings
        const settings = await autoForumModule.getGuildFilterSettings(interaction.guild.id);
        const guildSettings = await autoForumModule.getGuildSettings(interaction.guild.id);

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Cài đặt lọc nội dung AutoForumPost')
            .setDescription(`Cài đặt hiện tại cho **${interaction.guild.name}**`)
            .setColor(0x00AE86)
            .setTimestamp()
            .setFooter({ text: `${interaction.guild.name}`, iconURL: interaction.guild.iconURL() });

        embed.addFields(
            {
                name: '🚫 Lọc tin nhắn chỉ có hashtag',
                value: settings.filter_hashtag_only ? '✅ Bật' : '❌ Tắt',
                inline: true
            },
            {
                name: '📏 Độ dài tối thiểu',
                value: `${settings.min_content_length} ký tự`,
                inline: true
            },
            {
                name: '📊 Thống kê',
                value: `📝 Thiết lập: ${guildSettings.length}\n` +
                    `📅 Cập nhật: ${settings.updated_at ?
                        `<t:${Math.floor(new Date(settings.updated_at).getTime() / 1000)}:R>` :
                        'Chưa có thay đổi'}`,
                inline: true
            }
        );

        embed.addFields({
            name: '💡 Hướng dẫn',
            value: '• **Lọc hashtag**: Ngăn tin nhắn chỉ có hashtag không có nội dung\n' +
                '• **Độ dài tối thiểu**: Yêu cầu nội dung tối thiểu (không tính hashtag)\n' +
                '• Tin nhắn có file đính kèm hoặc embed sẽ luôn được chấp nhận',
            inline: false
        });

        embed.addFields({
            name: '🔧 Commands',
            value: '• `/autoforumpost_filter_settings hashtag-filter true/false`\n' +
                '• `/autoforumpost_filter_settings min-length <số>`\n' +
                '• `/autoforumpost_filter_settings view`',
            inline: false
        });

        return await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }

    async handleHashtagFilter(interaction, enabled) {
        // Get the AutoForumPost module
        const autoForumModule = interaction.client.moduleManager.modules.get('autoForumPost');
        if (!autoForumModule) {
            return await interaction.reply({
                content: '❌ Module AutoForumPost chưa được khởi chạy!',
                ephemeral: true
            });
        }

        // Get current settings to preserve min_content_length
        const currentSettings = await autoForumModule.getGuildFilterSettings(interaction.guild.id);

        // Update the setting
        const success = await autoForumModule.updateGuildFilterSettings(
            interaction.guild.id,
            enabled,
            currentSettings.min_content_length
        );

        if (success) {
            const statusText = enabled ? 'bật' : 'tắt';
            const emoji = enabled ? '✅' : '❌';

            return await interaction.reply({
                content: `${emoji} **Đã ${statusText} lọc tin nhắn chỉ có hashtag!**\n\n` +
                    `📝 **Trạng thái:** ${enabled ? 'Tin nhắn chỉ có hashtag sẽ bị bỏ qua' : 'Tin nhắn chỉ có hashtag sẽ được gửi'}\n\n` +
                    `Cài đặt này áp dụng cho tất cả thiết lập AutoForumPost trong server.`,
                ephemeral: true
            });
        } else {
            return await interaction.reply({
                content: '❌ Không thể cập nhật cài đặt. Vui lòng thử lại.',
                ephemeral: true
            });
        }
    }

    async handleMinLength(interaction, length) {
        // Get the AutoForumPost module
        const autoForumModule = interaction.client.moduleManager.modules.get('autoForumPost');
        if (!autoForumModule) {
            return await interaction.reply({
                content: '❌ Module AutoForumPost chưa được khởi chạy!',
                ephemeral: true
            });
        }

        // Get current settings to preserve filter_hashtag_only
        const currentSettings = await autoForumModule.getGuildFilterSettings(interaction.guild.id);

        // Update the setting
        const success = await autoForumModule.updateGuildFilterSettings(
            interaction.guild.id,
            currentSettings.filter_hashtag_only,
            length
        );

        if (success) {
            return await interaction.reply({
                content: `✅ **Đã cập nhật độ dài tối thiểu!**\n\n` +
                    `📏 **Độ dài mới:** ${length} ký tự\n\n` +
                    `Tin nhắn cần có ít nhất ${length} ký tự nội dung (không tính hashtag) để được gửi đến forum.`,
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

module.exports = FilterSettingsCommand;
