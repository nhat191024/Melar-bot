const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class IncludeCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'xfixer_include';
        this.description = 'Include a channel back in X link fixing';
        this.category = 'XFixer';
        this.module = 'xFixer';
        this.cooldown = 30;
        this.permissions = [PermissionFlagsBits.ManageChannels];
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('Channel to include back in X link fixing')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread)
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);
    }

    async execute(interaction) {
        try {
            if (this.isSlashCommand(interaction)) {
                const channel = interaction.options.getChannel('channel');
                return await this.handleInclude(interaction, channel);
            } else {
                // Prefix command: !xfixer-include #channel
                const commandArgs = interaction._args || [];
                if (commandArgs.length < 1) {
                    return await interaction.reply({
                        content: '❌ Cách dùng: `!xfixer-include #kênh`',
                        ephemeral: true
                    });
                }

                const channelId = commandArgs[0].replace(/[<#>]/g, '');
                const channel = interaction.guild.channels.cache.get(channelId);

                if (!channel) {
                    return await interaction.reply('❌ Kênh không hợp lệ!');
                }

                return await this.handleInclude(interaction, channel);
            }
        } catch (error) {
            console.error('Error in xfixer include command:', error);
            return await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi bao gồm kênh vào X fixer.',
                ephemeral: true
            });
        }
    }

    async handleInclude(interaction, channel) {
        // Get the XFixer module
        const xFixerModule = interaction.client.moduleManager.modules.get('xFixer');
        if (!xFixerModule) {
            return await interaction.reply({
                content: '❌ Module XFixer chưa được khởi chạy!',
                ephemeral: true
            });
        }

        // Check if channel is excluded
        const isExcluded = await xFixerModule.isChannelExcluded(interaction.guild.id, channel.id);
        if (!isExcluded) {
            return await interaction.reply({
                content: `⚠️ ${channel} hiện đang được bao gồm trong X link fixing rồi.`,
                ephemeral: true
            });
        }

        // Include the channel back
        const success = await xFixerModule.includeChannel(interaction.guild.id, channel.id);

        if (success) {
            return await interaction.reply({
                content: `✅ **Đã bao gồm kênh vào X Fixer!**\n\n` +
                    `📝 **Kênh:** ${channel}\n\n` +
                    `X.com links trong ${channel} sẽ được tự động chuyển đổi thành fixvx.com.`,
                ephemeral: true
            });
        } else {
            return await interaction.reply({
                content: `❌ Không tìm thấy ${channel} trong danh sách loại trừ.`,
                ephemeral: true
            });
        }
    }
}

module.exports = IncludeCommand;
