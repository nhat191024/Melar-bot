const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const BaseCommand = require('../../../../utils/BaseCommand');

class GetNoteCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'note_list';
        this.description = 'List all notes';
        this.category = 'utility';
        this.module = 'utility';
        this.cooldown = 3;
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description);
    }

    async execute(interaction) {
        try {
            const utilityModule = interaction.client.moduleManager.modules.get('utility');

            if (!utilityModule) {
                return await interaction.reply({
                    content: `❌ Module ${this.module} chưa được khởi chạy.`,
                    ephemeral: true
                });
            }

            const notes = await utilityModule.getNotes(interaction.user.id);
            if (!notes || notes.length === 0) {
                return await interaction.reply({
                    content: '📝 Bạn chưa có ghi chú nào.\n💡 Sử dụng `/note_add` để thêm ghi chú mới.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('📚 Danh sách ghi chú của bạn')
                .setColor(0x5865F2)
                .setTimestamp()
                .setFooter({ text: `Tổng cộng: ${notes.length} ghi chú` });

            let notesWithDeadline = [];
            let notesWithoutDeadline = [];

            notes.forEach(note => {
                if (note.deadline) {
                    notesWithDeadline.push(note);
                } else {
                    notesWithoutDeadline.push(note);
                }
            });

            // Add notes with deadline first
            if (notesWithDeadline.length > 0) {
                let deadlineNotesText = '';
                notesWithDeadline.forEach(note => {
                    const formattedDeadline = utilityModule.formatDeadlineVietnamese(note.deadline);
                    const now = new Date();
                    const deadline = new Date(note.deadline);
                    const isOverdue = deadline <= now;

                    let statusIcon = '⏰';
                    if (isOverdue) {
                        statusIcon = '🔴';
                    } else {
                        // Check how close to deadline
                        const timeDiff = deadline - now;
                        const hoursLeft = timeDiff / (1000 * 60 * 60);

                        if (hoursLeft <= 1) statusIcon = '🚨';
                        else if (hoursLeft <= 24) statusIcon = '⚠️';
                        else if (hoursLeft <= 72) statusIcon = '🟡';
                    }

                    deadlineNotesText += `**${statusIcon} ID #${note.id}:** ${note.content}\n`;
                    deadlineNotesText += `📅 **Hạn chót:** ${formattedDeadline}`;
                    if (isOverdue) {
                        deadlineNotesText += ' **(QUÁ HẠN)**';
                    }
                    deadlineNotesText += '\n\n';
                });

                embed.addFields({
                    name: '🗓️ Ghi chú có thời hạn',
                    value: deadlineNotesText.trim() || 'Không có',
                    inline: false
                });
            }

            // Add notes without deadline
            if (notesWithoutDeadline.length > 0) {
                let normalNotesText = '';
                notesWithoutDeadline.forEach(note => {
                    const createdDate = new Date(note.created_at);
                    const formattedDate = createdDate.toLocaleDateString('vi-VN');

                    normalNotesText += `**📝 ID #${note.id}:** ${note.content}\n`;
                    normalNotesText += `📅 **Ngày tạo:** ${formattedDate}\n\n`;
                });

                embed.addFields({
                    name: '📝 Ghi chú thường',
                    value: normalNotesText.trim() || 'Không có',
                    inline: false
                });
            }

            // Add usage tips
            embed.addFields({
                name: '💡 Hướng dẫn',
                value: '• Sử dụng `/note_remove` để xóa ghi chú\n' +
                    '• Bạn có thể xóa nhiều ghi chú cùng lúc: `/note_remove ids:1,2,3`\n' +
                    '• Ghi chú có thời hạn sẽ được nhắc nhở tự động',
                inline: false
            });

            return await interaction.reply({
                embeds: [embed]
            });

        } catch (error) {
            console.error('Error while getting notes:', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi lấy danh sách ghi chú.',
                ephemeral: true
            });
        }
    }
}

module.exports = GetNoteCommand;