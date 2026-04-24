const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const BaseCommand = require('../../../utils/BaseCommand');

class TaskUpdateStatusCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'task_update_status';
        this.description = 'Update task status (Admin only)';
        this.category = 'productivity';
        this.module = 'taskManager';
        this.cooldown = 3;
        this.permissions = [PermissionFlagsBits.Administrator];
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addIntegerOption(option =>
                option.setName('id')
                    .setDescription('ID của task cần cập nhật trạng thái')
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

            // Get task details first to verify it exists
            const taskDetails = await taskManagerModule.getTaskById(taskId);

            if (!taskDetails) {
                return await interaction.reply({
                    content: `❌ Không tìm thấy task với ID #${taskId}.`,
                    ephemeral: true
                });
            }

            // Show status selection interface
            await this.showStatusSelection(interaction, taskDetails);

        } catch (error) {
            console.error('Error while updating task status:', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi cập nhật trạng thái task.'
            });
        }
    }

    async showStatusSelection(interaction, taskDetails) {
        const currentStatusLabel = this.getStatusLabel(taskDetails.status);
        const currentStatusEmoji = this.getStatusEmoji(taskDetails.status);

        const embed = new EmbedBuilder()
            .setTitle('🔄 Cập nhật trạng thái task')
            .setColor(0x5865F2)
            .setTimestamp()
            .addFields(
                { name: '📋 Task:', value: `**#${taskDetails.id}: ${taskDetails.title}**`, inline: false },
                { name: '👤 Người được giao:', value: `<@${taskDetails.user_id}>`, inline: true },
                { name: '✍️ Người tạo:', value: `<@${taskDetails.created_by_user_id}>`, inline: true },
                { name: '📊 Trạng thái hiện tại:', value: `${currentStatusEmoji} ${currentStatusLabel}`, inline: true }
            );

        if (taskDetails.description) {
            embed.addFields({ name: '📝 Mô tả:', value: taskDetails.description, inline: false });
        }

        if (taskDetails.deadline) {
            const formattedDeadline = this.formatDeadlineVietnamese(taskDetails.deadline);
            if (formattedDeadline) {
                embed.addFields({ name: '⏰ Hạn chót:', value: formattedDeadline, inline: true });
            }
        }

        // Create status select menu - exclude current status
        const statusOptions = [
            {
                label: 'Đang chờ',
                description: 'Task đang chờ xử lý',
                value: 'pending',
                emoji: '🟠'
            },
            {
                label: 'Đang tiến hành',
                description: 'Task đang được thực hiện',
                value: 'in_progress',
                emoji: '🔵'
            },
            {
                label: 'Đã hoàn thành',
                description: 'Task đã hoàn thành',
                value: 'completed',
                emoji: '🟢'
            },
            {
                label: 'Đã hủy',
                description: 'Task đã bị hủy',
                value: 'cancelled',
                emoji: '🟡'
            },
            {
                label: 'Quá hạn',
                description: 'Task đã quá hạn',
                value: 'overdue',
                emoji: '🔴'
            }
        ];

        // Filter out current status
        const availableOptions = statusOptions.filter(option => option.value !== taskDetails.status);

        if (availableOptions.length === 0) {
            return await interaction.reply({
                content: '❌ Không có trạng thái nào khác để cập nhật.',
                ephemeral: true
            });
        }

        const statusSelect = new StringSelectMenuBuilder()
            .setCustomId(`task_update_status_${taskDetails.id}`)
            .setPlaceholder('Chọn trạng thái mới...')
            .addOptions(availableOptions);

        const selectRow = new ActionRowBuilder().addComponents(statusSelect);

        const messageOptions = {
            embeds: [embed],
            components: [selectRow],
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            return await interaction.editReply(messageOptions);
        } else {
            return await interaction.reply(messageOptions);
        }
    }

    async handleStatusUpdate(interaction, taskId, newStatus) {
        try {
            const taskManagerModule = interaction.client.moduleManager.modules.get('taskManager');

            if (!taskManagerModule) {
                return await interaction.update({
                    content: '❌ Module taskManager chưa được khởi chạy.',
                    embeds: [],
                    components: []
                });
            }

            // Get current task details
            const taskDetails = await taskManagerModule.getTaskById(taskId);

            if (!taskDetails) {
                return await interaction.update({
                    content: `❌ Không tìm thấy task với ID #${taskId}.`,
                    embeds: [],
                    components: []
                });
            }

            if (taskDetails.status === newStatus) {
                return await interaction.update({
                    content: `❌ Task #${taskId} đã có trạng thái "${this.getStatusLabel(newStatus)}".`,
                    embeds: [],
                    components: []
                });
            }

            // Update task status
            const success = await taskManagerModule.updateTaskStatus(taskId, newStatus);

            if (success) {
                const oldStatusLabel = this.getStatusLabel(taskDetails.status);
                const newStatusLabel = this.getStatusLabel(newStatus);
                const newStatusEmoji = this.getStatusEmoji(newStatus);

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Cập nhật trạng thái thành công')
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .addFields(
                        { name: '📋 Task:', value: `**#${taskId}: ${taskDetails.title}**`, inline: false },
                        { name: '🔄 Thay đổi:', value: `${oldStatusLabel} → ${newStatusEmoji} ${newStatusLabel}`, inline: false },
                        { name: '👤 Người được giao:', value: `<@${taskDetails.user_id}>`, inline: true },
                        { name: '👨‍💼 Cập nhật bởi:', value: `<@${interaction.user.id}>`, inline: true }
                    );

                await interaction.update({
                    embeds: [successEmbed],
                    components: []
                });

                // Send notification to assignee if status changed to completed or cancelled
                if (newStatus === 'completed' || newStatus === 'cancelled') {
                    try {
                        const assignee = await interaction.client.users.fetch(taskDetails.user_id);
                        if (assignee) {
                            const notificationEmbed = new EmbedBuilder()
                                .setTitle('📢 Thông báo cập nhật task')
                                .setColor(newStatus === 'completed' ? 0x00FF00 : 0xFFFF00)
                                .addFields(
                                    { name: '📋 Task:', value: `**#${taskId}: ${taskDetails.title}**` },
                                    { name: '📊 Trạng thái mới:', value: `${newStatusEmoji} ${newStatusLabel}` },
                                    { name: '👨‍💼 Cập nhật bởi:', value: `<@${interaction.user.id}>` }
                                )
                                .setTimestamp();

                            await assignee.send({ embeds: [notificationEmbed] });
                        }
                    } catch (dmError) {
                        console.log(`Could not send DM to user ${taskDetails.user_id}: ${dmError.message}`);
                    }
                }

            } else {
                await interaction.update({
                    content: `❌ Không thể cập nhật trạng thái task #${taskId}.`,
                    embeds: [],
                    components: []
                });
            }

        } catch (error) {
            console.error('Error handling status update:', error);
            await interaction.update({
                content: '❌ Đã xảy ra lỗi khi cập nhật trạng thái.',
                embeds: [],
                components: []
            });
        }
    }

    getStatusEmoji(status) {
        const statusEmojis = {
            'pending': '🟠',
            'in_progress': '🔵',
            'completed': '🟢',
            'cancelled': '🟡',
            'overdue': '🔴',
        };
        return statusEmojis[status] || '📝';
    }

    getStatusLabel(status) {
        const statusLabels = {
            'pending': 'Đang chờ',
            'in_progress': 'Đang tiến hành',
            'completed': 'Đã hoàn thành',
            'cancelled': 'Đã hủy',
            'overdue': 'Quá hạn',
        };
        return statusLabels[status] || 'Không xác định';
    }

    formatDeadlineVietnamese(deadline) {
        if (!deadline) return null;

        try {
            const date = new Date(deadline);
            if (isNaN(date.getTime())) return null;

            const dayNames = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
            const dayName = dayNames[date.getDay()];

            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');

            return `${dayName}, ${day}/${month}/${year} lúc ${hours}:${minutes}`;
        } catch (error) {
            return null;
        }
    }

    registerInteractionHandlers(moduleManager) {
        moduleManager.registerInteractionHandler({
            customId: 'task_update_status_',
            type: 'select',
            handler: async (interaction) => {
                const taskId = parseInt(interaction.customId.split('_')[3]);
                const selectedStatus = interaction.values[0];
                await this.handleStatusUpdate(interaction, taskId, selectedStatus);
                return true;
            }
        });
    }
}

module.exports = TaskUpdateStatusCommand;