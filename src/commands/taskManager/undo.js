const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class TaskUndoCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'task_undo';
        this.description = 'Undo the last completed task';
        this.category = 'productivity';
        this.module = 'taskManager';
        this.cooldown = 3;
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description);
    }

    async execute(interaction) {
        try {
            const taskManagerModule = interaction.client.moduleManager.modules.get('taskManager');

            if (!taskManagerModule) {
                return await interaction.reply({
                    content: `❌ Module ${this.module} chưa được khởi chạy.`
                });
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

            // Get last completed task - admin can undo any task, users can only undo their own
            let lastCompletedTaskId;
            let completedBy;

            if (isAdmin) {
                // Admin can undo the last completed task by anyone
                const lastCompletedInfo = await taskManagerModule.getLastCompletedTaskGlobal();
                if (lastCompletedInfo) {
                    lastCompletedTaskId = lastCompletedInfo.taskId;
                    completedBy = lastCompletedInfo.userId;
                }
            } else {
                // Regular users can only undo their own completed tasks
                lastCompletedTaskId = await taskManagerModule.getLastCompletedTask(interaction.user.id);
                completedBy = interaction.user.id;
            }

            if (!lastCompletedTaskId) {
                const message = isAdmin
                    ? '❌ Không có task nào vừa được đánh dấu hoàn thành để hoàn tác.'
                    : '❌ Bạn chưa đánh dấu hoàn thành task nào để hoàn tác.';
                return await interaction.reply({
                    content: message,
                    ephemeral: true
                });
            }

            // Get task details
            const taskDetails = await taskManagerModule.getTaskById(lastCompletedTaskId);

            if (!taskDetails) {
                return await interaction.reply({
                    content: `❌ Không thể tìm thấy task để hoàn tác.`,
                    ephemeral: true
                });
            }

            if (taskDetails.status !== 'completed') {
                return await interaction.reply({
                    content: `❌ Task **${taskDetails.title}** không ở trạng thái hoàn thành để hoàn tác.`,
                    ephemeral: true
                });
            }

            // Check permissions: Admin can undo any task, regular users can only undo tasks they completed themselves
            // Since getLastCompletedTask already filters by user, regular users can only undo their own completions
            // Admins get additional privilege to undo any completion

            // Undo the completion
            const success = await taskManagerModule.undoTaskCompletion(lastCompletedTaskId);

            if (success) {
                // Clear the last completed task record for the person who completed it
                await taskManagerModule.clearLastCompletedTask(completedBy);

                const completedByText = isAdmin && completedBy !== interaction.user.id
                    ? ` (được hoàn thành bởi <@${completedBy}>)`
                    : '';

                await interaction.reply({
                    content: `✅ Đã hoàn tác việc đánh dấu hoàn thành task **${taskDetails.title}** (ID: #${lastCompletedTaskId})${completedByText}. Task đã chuyển về trạng thái "Đang tiến hành".`
                });
            } else {
                await interaction.reply({
                    content: `❌ Không thể hoàn tác task #${lastCompletedTaskId}.`,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Error while undoing task completion:', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi hoàn tác task.'
            });
        }
    }
}

module.exports = TaskUndoCommand;