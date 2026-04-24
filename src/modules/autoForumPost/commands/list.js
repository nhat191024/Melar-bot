const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const BaseCommand = require('../../../utils/BaseCommand');

class ListCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'autoforumpost_list';
        this.description = 'List all auto forum posting setups in this server';
        this.category = 'AutoForumPost';
        this.module = 'autoForumPost';
        this.cooldown = 5;
        this.permissions = [PermissionFlagsBits.ManageChannels];
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);
    }

    async execute(interaction) {
        try {
            return await this.handleList(interaction);
        } catch (error) {
            console.error('Error in autoforumpost list command:', error);
            return await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi liệt kê các thiết lập auto forum posting.',
                ephemeral: true
            });
        }
    }

    async handleList(interaction) {
        // Get the AutoForumPost module
        const autoForumModule = interaction.client.moduleManager.modules.get('autoForumPost');
        if (!autoForumModule) {
            return await interaction.reply({
                content: '❌ Module AutoForumPost chưa được khởi chạy!',
                ephemeral: true
            });
        }

        // Get all settings for this guild
        const settings = await autoForumModule.getGuildSettings(interaction.guild.id);

        if (settings.length === 0) {
            return await interaction.reply({
                content: '📝 Không tìm thấy thiết lập auto forum posting nào trong server này.',
                ephemeral: true
            });
        }

        // Create embed with all setups
        const embed = new EmbedBuilder()
            .setTitle('🤖 Thiết lập Auto Forum Posting')
            .setDescription(`Tìm thấy ${settings.length} thiết lập trong server này`)
            .setColor(0x00AE86)
            .setTimestamp()
            .setFooter({ text: `${interaction.guild.name}`, iconURL: interaction.guild.iconURL() });

        for (let i = 0; i < settings.length; i++) {
            const setting = settings[i];

            // Get channel objects
            const sourceChannel = interaction.guild.channels.cache.get(setting.channel_id);
            const forumChannel = interaction.guild.channels.cache.get(setting.forum_id);

            const sourceChannelName = sourceChannel ? `#${sourceChannel.name}` : `Kênh không xác định (${setting.channel_id})`;
            const forumChannelName = forumChannel ? `#${forumChannel.name}` : `Forum không xác định (${setting.forum_id})`;

            embed.addFields({
                name: `Thiết lập #${i + 1}`,
                value: `📝 **Kênh nguồn:** ${sourceChannelName}\n` +
                    `📋 **Kênh forum:** ${forumChannelName}\n` +
                    `📅 **Tạo lúc:** <t:${Math.floor(new Date(setting.created_at).getTime() / 1000)}:R>`,
                inline: true
            });
        }

        return await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
}

module.exports = ListCommand;
