const { SlashCommandBuilder } = require('discord.js');
const BaseCommand = require('../../../utils/BaseCommand');

class AddNoteCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'note_add';
        this.description = 'Add a new note';
        this.category = 'utility';
        this.module = 'utility';
        this.cooldown = 3;
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addStringOption(option =>
                option.setName('note')
                    .setDescription('The note content')
                    .setRequired(true));
    }

    async execute(interaction) {
        try {
            const noteContent = interaction.options.getString('note');
            if (!noteContent) {
                return await interaction.reply({
                    content: `❌ Cách dùng: \`${this.getPrefix()}note_add < nội dung ghi chú > \``
                });
            }

            const utilityModule = interaction.client.moduleManager.modules.get('utility');

            if (!utilityModule) {
                return await interaction.reply({
                    content: `❌ Module ${this.module} chưa được khởi chạy.`
                });
            }

            const noteId = await utilityModule.createNote(interaction.user.id, noteContent);
            if (!noteId) {
                return await interaction.reply({
                    content: '❌ Đã xảy ra lỗi khi thêm ghi chú.'
                });
            } else {
                return await interaction.reply({
                    content: `✅ Đã thêm ghi chú với ID: ${noteId}.`
                });
            }
        }
        catch (error) {
            console.error('Error adding note:', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi thêm ghi chú.'
            });
        }
    }
}

module.exports = AddNoteCommand;