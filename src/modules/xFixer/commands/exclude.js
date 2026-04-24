const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const BaseCommand = require('../../../utils/BaseCommand');

class ExcludeCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'xfixer_exclude';
        this.description = 'Exclude a channel from X link fixing';
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
                    .setDescription('Channel to exclude from X link fixing')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread)
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);
    }

    async execute(interaction) {
        try {
            if (this.isSlashCommand(interaction)) {
                const channel = interaction.options.getChannel('channel');
                return await this.handleExclude(interaction, channel);
            } else {
                // Prefix command: !xfixer-exclude #channel
                const commandArgs = interaction._args || [];
                if (commandArgs.length < 1) {
                    return await interaction.reply({
                        content: '❌ Cách dùng: `!xfixer-exclude #kênh`',
                        ephemeral: true
                    });
                }

                const channelId = commandArgs[0].replace(/[<#>]/g, '');
                const channel = interaction.guild.channels.cache.get(channelId);

                if (!channel) {
                    return await interaction.reply('❌ Kênh không hợp lệ!');
                }

                return await this.handleExclude(interaction, channel);
            }
        } catch (error) {
            console.error('Error in xfixer exclude command:', error);
            return await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi loại trừ kênh khỏi X fixer.',
                ephemeral: true
            });
        }
    }

    async handleExclude(interaction, channel) {
        // Get the xFixer module
        const xFixerModule = interaction.client.moduleManager.modules.get('xFixer');
        if (!xFixerModule) {
            return await interaction.reply({
                content: '❌ Module xFixer chưa được khởi chạy!',
                ephemeral: true
            });
        }

        // Check if channel is already excluded
        const isExcluded = await xFixerModule.isChannelExcluded(interaction.guild.id, channel.id);
        if (isExcluded) {
            return await interaction.reply({
                content: `⚠️ ${channel} đã được loại trừ khỏi X link fixing rồi.`,
                ephemeral: true
            });
        }

        // Exclude the channel
        const success = await xFixerModule.excludeChannel(interaction.guild.id, channel.id);

        if (success) {
            return await interaction.reply({
                content: `✅ **Đã loại trừ kênh khỏi X Fixer!**\n\n` +
                    `📝 **Kênh:** ${channel}\n\n` +
                    `X.com links trong ${channel} sẽ không còn được tự động chuyển đổi nữa.`,
                ephemeral: true
            });
        } else {
            return await interaction.reply({
                content: '❌ Không thể loại trừ kênh. Vui lòng thử lại.',
                ephemeral: true
            });
        }
    }
}

module.exports = ExcludeCommand;
