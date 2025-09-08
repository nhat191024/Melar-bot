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
                option.setName('note_id')
                    .setDescription('The ID of the note to remove')
                    .setRequired(true));
    }

    async execute(interaction) {
        try {
            const id = interaction.options.getString('note_id');
            if (!id) {
                return await interaction.reply({
                    content: `❌ Cách dùng: \`${this.getPrefix()}note_remove < ID ghi chú > \``
                });
            }

            const utilityModule = interaction.client.moduleManager.modules.get('utility');

            if (!utilityModule) {
                return await interaction.reply({
                    content: `❌ Module ${this.module} chưa được khởi chạy.`
                });
            }

            const success = await utilityModule.removeNote(interaction.user.id, id);
            if (!success) {
                return await interaction.reply({
                    content: '❌ Đã xảy ra lỗi khi xóa ghi chú! vui lòng kiểm tra lại ID ghi chú hoặc thử lại sau.'
                });
            } else {
                return await interaction.reply({
                    content: `✅ Đã xóa ghi chú với ID: ${id}.`
                });
            }
        }
        catch (error) {
            console.error('Error removing note:', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi xóa ghi chú.'
            });
        }
    }
}

module.exports = RemoveNoteCommand;