const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class TaskCompleteCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'task_complete';
        this.description = 'Mark a task as completed';
        this.category = 'productivity';
        this.module = 'taskManager';
        this.cooldown = 3;
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addIntegerOption(option =>
                option.setName('id')
                    .setDescription('ID của task cần đánh dấu hoàn thành')
                    .setRequired(true));
    }

    async execute(interaction) {
        try {
            const taskManagerModule = interaction.client.moduleManager.modules.get('taskManager');

            if (!taskManagerModule) {
                return await interaction.reply({
                    content: `❌ Module ${this.module} chưa được khởi chạy.`
                });
            }

            const taskId = interaction.options.getInteger('id');

            if (!taskId || taskId <= 0) {
                const prefix = this.getPrefix();
                return await interaction._originalMessage.channel.send(
                    `❌ **Cách sử dụng lệnh prefix:**\n` +
                    `\`${prefix}${this.name} <ID task>\`` +
                    `\n\n` +
                    `**Ví dụ:**\n` +
                    `\`${prefix}${this.name} 123\`\n\n`
                );
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            const canManageTasks = member.permissions.has(PermissionFlagsBits.Administrator);

            // Get task details first to verify it exists and get info
            const taskDetails = await taskManagerModule.getTaskById(taskId);

            if (!taskDetails) {
                return await interaction.reply({
                    content: `❌ Không tìm thấy task với ID #${taskId}.`,
                    ephemeral: true
                });
            }

            // Check if user has permission to complete this task
            if (!canManageTasks && taskDetails.user_id !== interaction.user.id) {
                return await interaction.reply({
                    content: '❌ Bạn chỉ có thể đánh dấu hoàn thành task được giao cho mình.',
                    ephemeral: true
                });
            }

            // Check if task is already completed
            if (taskDetails.status === 'completed') {
                return await interaction.reply({
                    content: `❌ Task #${taskId} đã được đánh dấu hoàn thành trước đó.`,
                    ephemeral: true
                });
            }

            // Mark task as completed
            const success = await taskManagerModule.markTaskAsCompleted(taskId);

            if (success) {
                // Store last completed task for undo functionality
                await taskManagerModule.setLastCompletedTask(interaction.user.id, taskId);

                await interaction.reply({
                    content: `✅ Đã kết thúc task **${taskDetails.title}** (ID: #${taskId}). Nếu muốn hoàn tác, gõ lệnh \`/task_undo\`.`
                });
            } else {
                await interaction.reply({
                    content: `❌ Không thể đánh dấu task #${taskId} là hoàn thành.`,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Error while completing task:', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi đánh dấu task hoàn thành.'
            });
        }
    }
}

module.exports = TaskCompleteCommand;