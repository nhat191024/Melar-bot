const { SlashCommandBuilder } = require('discord.js');
const BaseCommand = require('../../../utils/BaseCommand');

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
                    content: `❌ Module ${this.module} chưa được khởi chạy.`
                });
            }

            const notes = await utilityModule.getNotes(interaction.user.id);
            if (!notes || notes.length === 0) {
                return await interaction.reply({
                    content: '❌ Bạn chưa có ghi chú nào.'
                });
            } else {
                return await interaction.reply({
                    content: `✅ Danh sách ghi chú của bạn:\n${notes.map(note => `- Id: ${note.id} - ${note.content}`).join('\n')}`
                });
            }
        }
        catch (error) {
            console.error('Error while getting notes:', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi lấy danh sách ghi chú.'
            });
        }
    }
}

module.exports = GetNoteCommand;