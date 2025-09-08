const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class RemoveCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'autoforumpost_remove';
        this.description = 'Remove automatic forum posting for a channel';
        this.category = 'AutoForumPost';
        this.module = 'autoForumPost';
        this.cooldown = 5;
        this.permissions = [PermissionFlagsBits.ManageChannels];
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addChannelOption(option =>
                option.setName('source-channel')
                    .setDescription('Channel to remove auto forum posting from')
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);
    }

    async execute(interaction) {
        try {
            if (this.isSlashCommand(interaction)) {
                const sourceChannel = interaction.options.getChannel('source-channel');
                return await this.handleRemove(interaction, sourceChannel);
            } else {
                // Prefix command: !autoforumpost-remove #channel
                const commandArgs = interaction._args || [];
                if (commandArgs.length < 1) {
                    return await interaction.reply({
                        content: '❌ Cách dùng: `!autoforumpost-remove #kênh-nguồn`',
                        ephemeral: true
                    });
                }

                const sourceChannelId = commandArgs[0].replace(/[<#>]/g, '');
                const sourceChannel = interaction.guild.channels.cache.get(sourceChannelId);

                if (!sourceChannel) {
                    return await interaction.reply('❌ Kênh không hợp lệ!');
                }

                return await this.handleRemove(interaction, sourceChannel);
            }
        } catch (error) {
            console.error('Error in autoforumpost remove command:', error);
            return await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi xóa auto forum posting.',
                ephemeral: true
            });
        }
    }

    async handleRemove(interaction, sourceChannel) {
        // Get the AutoForumPost module
        const autoForumModule = interaction.client.moduleManager.modules.get('autoForumPost');
        if (!autoForumModule) {
            return await interaction.reply({
                content: '❌ Module AutoForumPost chưa được khởi chạy!',
                ephemeral: true
            });
        }

        // Remove settings from database
        const success = await autoForumModule.removeSettings(
            interaction.guild.id,
            sourceChannel.id
        );

        if (success) {
            return await interaction.reply({
                content: `✅ **Đã xóa Auto Forum Posting!**\n\n` +
                    `📝 **Kênh:** ${sourceChannel}\n\n` +
                    `Tin nhắn trong ${sourceChannel} sẽ không còn tự động tạo forum post nữa.`,
                ephemeral: true
            });
        } else {
            return await interaction.reply({
                content: `❌ Không tìm thấy thiết lập auto forum posting cho ${sourceChannel}.`,
                ephemeral: true
            });
        }
    }
}

module.exports = RemoveCommand;
