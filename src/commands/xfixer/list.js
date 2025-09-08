const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class ListCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'xfixer_list';
        this.description = 'List all channels excluded from X link fixing';
        this.category = 'XFixer';
        this.module = 'xFixer';
        this.cooldown = 30;
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
            console.error('Error in xfixer list command:', error);
            return await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi liệt kê các kênh loại trừ.',
                ephemeral: true
            });
        }
    }

    async handleList(interaction) {
        // Get the XFixer module
        const xFixerModule = interaction.client.moduleManager.modules.get('xFixer');
        if (!xFixerModule) {
            return await interaction.reply({
                content: '❌ Module XFixer chưa được khởi chạy!',
                ephemeral: true
            });
        }

        // Get all excluded channels for this guild
        const excludedChannels = await xFixerModule.getExcludedChannels(interaction.guild.id);

        if (excludedChannels.length === 0) {
            return await interaction.reply({
                content: '📝 Không có kênh nào được loại trừ khỏi X link fixing trong server này.\n\n' +
                    '💡 **Tip:** Sử dụng `/xfixer_exclude` để loại trừ kênh khỏi việc tự động chuyển đổi X.com links.',
                ephemeral: true
            });
        }

        // Create embed with all excluded channels
        const embed = new EmbedBuilder()
            .setTitle('🚫 Kênh được loại trừ khỏi X Fixer')
            .setDescription(`Tìm thấy ${excludedChannels.length} kênh được loại trừ trong server này`)
            .setColor(0xFF6B6B)
            .setTimestamp()
            .setFooter({ text: `${interaction.guild.name}`, iconURL: interaction.guild.iconURL() });

        let fieldValue = '';
        for (let i = 0; i < excludedChannels.length; i++) {
            const excludedData = excludedChannels[i];
            const channel = interaction.guild.channels.cache.get(excludedData.channel_id);
            const channelName = channel ? `${channel}` : `Kênh không xác định (${excludedData.channel_id})`;
            const createdTime = Math.floor(new Date(excludedData.created_at).getTime() / 1000);

            fieldValue += `• ${channelName} - <t:${createdTime}:R>\n`;

            // Discord embed field value limit is 1024 chars, split if needed
            if (fieldValue.length > 950 || i === excludedChannels.length - 1) {
                embed.addFields({
                    name: i === 0 ? 'Danh sách kênh loại trừ:' : 'Tiếp tục:',
                    value: fieldValue,
                    inline: false
                });
                fieldValue = '';
            }
        }

        embed.addFields({
            name: '💡 Hướng dẫn',
            value: '• `/xfixer_include #kênh` - Bao gồm kênh vào X fixing\n' +
                '• `/xfixer_exclude #kênh` - Loại trừ kênh khỏi X fixing',
            inline: false
        });

        return await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
}

module.exports = ListCommand;
