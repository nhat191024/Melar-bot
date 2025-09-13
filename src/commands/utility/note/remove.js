const { SlashCommandBuilder } = require('discord.js');
const BaseCommand = require('../../../utils/BaseCommand');

class RemoveNoteCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'note_remove';
        this.description = 'Remove a note';
        this.category = 'utility';
        this.module = 'utility';
        this.cooldown = 3;
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addStringOption(option =>
                option.setName('ids')
                    .setDescription('ID ghi chú cần xóa (có thể nhập nhiều ID cách nhau bằng dấu phẩy: 1,2,3)')
                    .setRequired(true));
    }

    async execute(interaction) {
        try {
            const idsString = interaction.options.getString('ids');
            if (!idsString) {
                return await interaction.reply({
                    content: '❌ Vui lòng nhập ID ghi chú cần xóa.',
                    ephemeral: true
                });
            }

            const utilityModule = interaction.client.moduleManager.modules.get('utility');

            if (!utilityModule) {
                return await interaction.reply({
                    content: `❌ Module ${this.module} chưa được khởi chạy.`,
                    ephemeral: true
                });
            }

            // Parse IDs (support both single ID and comma-separated IDs)
            const idStrings = idsString.split(',').map(id => id.trim());
            const noteIds = [];

            // Validate all IDs are numbers
            for (const idStr of idStrings) {
                const id = parseInt(idStr);
                if (isNaN(id) || id <= 0) {
                    return await interaction.reply({
                        content: `❌ ID không hợp lệ: "${idStr}". Vui lòng nhập số nguyên dương.`,
                        ephemeral: true
                    });
                }
                noteIds.push(id);
            }

            // Remove duplicates
            const uniqueIds = [...new Set(noteIds)];

            if (uniqueIds.length === 1) {
                // Single note removal
                const success = await utilityModule.removeNote(interaction.user.id, uniqueIds[0]);
                if (!success) {
                    return await interaction.reply({
                        content: `❌ Không thể xóa ghi chú với ID: ${uniqueIds[0]}. Vui lòng kiểm tra lại ID hoặc ghi chú có thể đã bị xóa trước đó.`,
                        ephemeral: true
                    });
                } else {
                    return await interaction.reply({
                        content: `✅ Đã xóa ghi chú với ID: **${uniqueIds[0]}**.`
                    });
                }
            } else {
                // Multiple notes removal
                const removedCount = await utilityModule.removeMultipleNotes(interaction.user.id, uniqueIds);

                if (removedCount === 0) {
                    return await interaction.reply({
                        content: `❌ Không thể xóa bất kỳ ghi chú nào với các ID: ${uniqueIds.join(', ')}. Vui lòng kiểm tra lại các ID.`,
                        ephemeral: true
                    });
                } else if (removedCount === uniqueIds.length) {
                    return await interaction.reply({
                        content: `✅ Đã xóa thành công **${removedCount}** ghi chú với các ID: ${uniqueIds.join(', ')}.`
                    });
                } else {
                    return await interaction.reply({
                        content: `⚠️ Đã xóa **${removedCount}** trong số **${uniqueIds.length}** ghi chú. Một số ID có thể không tồn tại hoặc đã bị xóa trước đó.`
                    });
                }
            }

        } catch (error) {
            console.error('Error removing note:', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi xóa ghi chú.',
                ephemeral: true
            });
        }
    }
}

module.exports = RemoveNoteCommand;