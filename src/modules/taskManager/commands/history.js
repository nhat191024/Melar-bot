const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BaseCommand = require('../../../utils/BaseCommand');

class TaskHistoryCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'task_history';
        this.description = 'View task history with filtering options';
        this.category = 'productivity';
        this.module = 'taskManager';
        this.cooldown = 3;
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('Xem lịch sử công việc của user cụ thể (chỉ admin)')
                    .setRequired(false));
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
            const canViewAll = member.permissions.has(PermissionFlagsBits.Administrator);
            const mentionedUser = interaction.options.getUser('user');

            if (mentionedUser && !canViewAll) {
                return await interaction.reply({
                    content: '❌ Bạn không có quyền xem lịch sử công việc của người khác.',
                    ephemeral: true
                });
            }

            // Show initial interface with status selector
            await this.showHistoryInterface(interaction, mentionedUser, canViewAll);

        } catch (error) {
            console.error('Error while getting task history:', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi lấy lịch sử công việc.'
            });
        }
    }

    async showHistoryInterface(interaction, mentionedUser = null, canViewAll = false, isUpdate = false) {
        const embed = new EmbedBuilder()
            .setTitle('📚 Lịch sử công việc')
            .setDescription('Chọn trạng thái công việc để xem lịch sử:')
            .setColor(0x5865F2)
            .setTimestamp();

        if (mentionedUser) {
            embed.addFields({ name: '👤 Người dùng:', value: `<@${mentionedUser.id}>`, inline: true });
        } else if (!canViewAll) {
            embed.addFields({ name: '👤 Người dùng:', value: `<@${interaction.user.id}>`, inline: true });
        } else {
            embed.addFields({ name: '🌐 Phạm vi:', value: 'Tất cả người dùng', inline: true });
        }

        // Create status select menu
        const statusSelect = new StringSelectMenuBuilder()
            .setCustomId(`task_history_status_${mentionedUser ? mentionedUser.id : (canViewAll ? 'all' : interaction.user.id)}`)
            .setPlaceholder('Chọn trạng thái công việc...')
            .addOptions([
                {
                    label: 'Tất cả trạng thái',
                    description: 'Hiển thị công việc với mọi trạng thái',
                    value: 'all',
                    emoji: '📋'
                },
                {
                    label: 'Đang chờ',
                    description: 'Công việc đang chờ xử lý',
                    value: 'pending',
                    emoji: '🟠'
                },
                {
                    label: 'Đang tiến hành',
                    description: 'Công việc đang được thực hiện',
                    value: 'in_progress',
                    emoji: '🔵'
                },
                {
                    label: 'Đã hoàn thành',
                    description: 'Công việc đã hoàn thành',
                    value: 'completed',
                    emoji: '🟢'
                },
                {
                    label: 'Đã hủy',
                    description: 'Công việc đã bị hủy',
                    value: 'cancelled',
                    emoji: '🟡'
                },
                {
                    label: 'Quá hạn',
                    description: 'Công việc đã quá hạn',
                    value: 'overdue',
                    emoji: '🔴'
                }
            ]);

        const selectRow = new ActionRowBuilder().addComponents(statusSelect);

        const messageOptions = {
            embeds: [embed],
            components: [selectRow]
        };

        if (isUpdate || interaction.replied || interaction.deferred) {
            return await interaction.editReply(messageOptions);
        } else {
            return await interaction.reply(messageOptions);
        }
    }

    async handleStatusSelection(interaction, selectedStatus, targetUserId) {
        try {
            const taskManagerModule = interaction.client.moduleManager.modules.get('taskManager');

            if (!taskManagerModule) {
                const errorMessage = {
                    content: '❌ Module taskManager chưa được khởi chạy.',
                    ephemeral: true
                };

                if (interaction.replied || interaction.deferred) {
                    return await interaction.followUp(errorMessage);
                } else {
                    return await interaction.reply(errorMessage);
                }
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            const canViewAll = member.permissions.has(PermissionFlagsBits.Administrator);

            let tasks = [];
            let statusFilter = selectedStatus === 'all' ? null : [selectedStatus];

            // Get tasks based on user permissions and target
            if (targetUserId === 'all' && canViewAll) {
                // Admin viewing all users
                tasks = statusFilter
                    ? await taskManagerModule.getAllTasksWithStatus(statusFilter)
                    : await taskManagerModule.getAllTasksAllStatus();
            } else if (targetUserId && targetUserId !== 'all' && canViewAll) {
                // Admin viewing specific user
                tasks = statusFilter
                    ? await taskManagerModule.getAllUserTasksWithStatus(targetUserId, statusFilter)
                    : await taskManagerModule.getAllUserTasksAllStatus(targetUserId);
            } else {
                // Regular user viewing own tasks
                const userId = interaction.user.id;
                tasks = statusFilter
                    ? await taskManagerModule.getAllUserTasksWithStatus(userId, statusFilter)
                    : await taskManagerModule.getAllUserTasksAllStatus(userId);
            }

            if (tasks.length === 0) {
                const statusLabel = this.getStatusLabel(selectedStatus);
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.update({
                            content: `❌ Không tìm thấy công việc nào với trạng thái "${statusLabel}".`,
                            embeds: [],
                            components: []
                        });
                    } else {
                        await interaction.editReply({
                            content: `❌ Không tìm thấy công việc nào với trạng thái "${statusLabel}".`,
                            embeds: [],
                            components: []
                        });
                    }
                } catch (updateError) {
                    console.error('Error updating interaction for empty tasks:', updateError);
                    await interaction.followUp({
                        content: `❌ Không tìm thấy công việc nào với trạng thái "${statusLabel}".`,
                        ephemeral: true
                    });
                }
                return;
            }

            await this.sendPaginatedHistory(interaction, tasks, 0, selectedStatus, targetUserId, true);

        } catch (error) {
            console.error('Error handling status selection:', error);

            const errorMessage = {
                content: '❌ Đã xảy ra lỗi khi xử lý yêu cầu.',
                ephemeral: true
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }

    async sendPaginatedHistory(interaction, allTasks, page = 0, selectedStatus = 'all', targetUserId = null, isUpdate = false) {
        // Sort tasks by created date (newest first) then by deadline
        const sortedTasks = this.sortTasksForHistory([...allTasks]);

        const tasksPerPage = 5;
        const totalPages = Math.ceil(sortedTasks.length / tasksPerPage);
        const startIndex = page * tasksPerPage;
        const endIndex = startIndex + tasksPerPage;
        const tasksOnThisPage = sortedTasks.slice(startIndex, endIndex);

        const statusLabel = this.getStatusLabel(selectedStatus);
        const embed = new EmbedBuilder()
            .setTitle(`📚 Lịch sử công việc - ${statusLabel}`)
            .setColor(this.getStatusColor(selectedStatus))
            .setTimestamp()
            .setFooter({ text: `Trang ${page + 1}/${totalPages} • Tổng cộng: ${sortedTasks.length} công việc` });

        // Add user info if viewing specific user
        if (targetUserId && targetUserId !== 'all') {
            embed.addFields({ name: '👤 Người dùng:', value: `<@${targetUserId}>`, inline: true });
        }

        tasksOnThisPage.forEach(task => {
            const statusEmoji = this.getStatusEmoji(task.status);

            // Build task information dynamically
            let taskInfo = [];

            if (task.description && task.description.trim()) {
                taskInfo.push(`**Mô tả:** ${task.description}`);
            }

            if (task.user_id) {
                taskInfo.push(`**Người được giao:** <@${task.user_id}>`);
            }

            if (task.created_by_user_id) {
                taskInfo.push(`**Người tạo:** <@${task.created_by_user_id}>`);
            }

            taskInfo.push(`**Trạng thái:** ${this.getStatusLabel(task.status)}`);

            const formattedDeadline = this.formatDeadlineVietnamese(task.deadline);
            if (formattedDeadline) {
                taskInfo.push(`**Hạn chót:** ${formattedDeadline}`);
            }

            if (task.link && task.link.trim()) {
                taskInfo.push(`**Link:** [Xem chi tiết](${task.link})`);
            }

            // Add creation date
            if (task.created_at) {
                const createdDate = this.formatDeadlineVietnamese(task.created_at);
                taskInfo.push(`**Ngày tạo:** ${createdDate}`);
            }

            // Special formatting for different statuses
            const isOverdue = task.status === 'overdue';
            const isCompleted = task.status === 'completed';

            let taskTitle;
            if (isOverdue) {
                taskTitle = `🔴 **[QUÁ HẠN] Công việc #${task.id}: ${task.title}**`;
            } else if (isCompleted) {
                taskTitle = `✅ **[HOÀN THÀNH] Công việc #${task.id}: ${task.title}**`;
            } else {
                taskTitle = `${statusEmoji} **Công việc #${task.id}: ${task.title}**`;
            }

            embed.addFields({
                name: taskTitle,
                value: `• ${taskInfo.join('\n• ')}`,
                inline: false
            });
        });

        // Create buttons for pagination and back to menu
        const row = new ActionRowBuilder();

        if (totalPages > 1) {
            // Previous button
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`task_history_prev_${page}_${selectedStatus}_${targetUserId || 'none'}`)
                    .setLabel('◀️ Trước')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0)
            );

            // Page info button
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`task_history_page_${page}`)
                    .setLabel(`${page + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true)
            );

            // Next button
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`task_history_next_${page}_${selectedStatus}_${targetUserId || 'none'}`)
                    .setLabel('Sau ▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages - 1)
            );
        }

        // Back to menu button
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`task_history_back_${targetUserId || 'none'}`)
                .setLabel('🔙 Chọn trạng thái khác')
                .setStyle(ButtonStyle.Secondary)
        );

        const messageOptions = { embeds: [embed], components: [row] };

        try {
            if (isUpdate && interaction.isSelectMenu() && !interaction.replied && !interaction.deferred) {
                return await interaction.update(messageOptions);
            } else if (interaction.replied || interaction.deferred) {
                return await interaction.editReply(messageOptions);
            } else {
                return await interaction.reply(messageOptions);
            }
        } catch (error) {
            console.error('Error in sendPaginatedHistory:', error);
            // Fallback to followUp if all else fails
            if (!interaction.replied && !interaction.deferred) {
                return await interaction.reply({ ...messageOptions, ephemeral: true });
            } else {
                return await interaction.followUp({ ...messageOptions, ephemeral: true });
            }
        }
    }

    sortTasksForHistory(tasks) {
        return tasks.sort((a, b) => {
            // First sort by created_at (newest first)
            const dateA = new Date(a.created_at || 0);
            const dateB = new Date(b.created_at || 0);
            const createdDiff = dateB - dateA;

            if (createdDiff !== 0) return createdDiff;

            // If same creation date, sort by deadline
            if (!a.deadline && !b.deadline) return 0;
            if (!a.deadline) return 1;
            if (!b.deadline) return -1;

            const deadlineA = new Date(a.deadline);
            const deadlineB = new Date(b.deadline);
            return deadlineA - deadlineB;
        });
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
            'all': 'Tất cả trạng thái',
            'pending': 'Đang chờ',
            'in_progress': 'Đang tiến hành',
            'completed': 'Đã hoàn thành',
            'cancelled': 'Đã hủy',
            'overdue': 'Quá hạn',
        };
        return statusLabels[status] || 'Không xác định';
    }

    getStatusColor(status) {
        const statusColors = {
            'all': 0x5865F2,
            'pending': 0xFF8C00,
            'in_progress': 0x3498DB,
            'completed': 0x00FF00,
            'cancelled': 0xFFD700,
            'overdue': 0xFF0000,
        };
        return statusColors[status] || 0x5865F2;
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

    async handleButtonInteraction(interaction) {
        if (!interaction.customId.startsWith('task_history_')) return false;
        const parts = interaction.customId.split('_');
        const action = parts[2]; // prev, next, back, page

        if (action === 'back') {
            const targetUserId = parts[3] === 'none' ? null : parts[3];
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const canViewAll = member.permissions.has(PermissionFlagsBits.Administrator);

            let mentionedUser = null;
            if (targetUserId && targetUserId !== 'all') {
                try {
                    mentionedUser = await interaction.client.users.fetch(targetUserId);
                } catch (error) {
                    // User might not exist anymore, continue without mentionedUser
                }
            }

            await interaction.deferUpdate();
            await this.showHistoryInterface(interaction, mentionedUser, canViewAll, true);
            return true;
        }

        if (action === 'prev' || action === 'next') {
            const currentPage = parseInt(parts[3]);
            const selectedStatus = parts[4];
            const targetUserId = parts[5] === 'none' ? null : parts[5];

            const taskManagerModule = interaction.client.moduleManager.modules.get('taskManager');
            if (!taskManagerModule) {
                const errorMessage = {
                    content: '❌ Module taskManager chưa được khởi chạy.',
                    ephemeral: true
                };

                if (interaction.replied || interaction.deferred) {
                    return await interaction.followUp(errorMessage);
                } else {
                    return await interaction.reply(errorMessage);
                }
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            const canViewAll = member.permissions.has(PermissionFlagsBits.Administrator);

            let tasks = [];
            let statusFilter = selectedStatus === 'all' ? null : [selectedStatus];

            // Get tasks based on user permissions and target
            if (targetUserId === 'all' && canViewAll) {
                tasks = statusFilter
                    ? await taskManagerModule.getAllTasksWithStatus(statusFilter)
                    : await taskManagerModule.getAllTasksAllStatus();
            } else if (targetUserId && targetUserId !== 'all' && canViewAll) {
                tasks = statusFilter
                    ? await taskManagerModule.getAllUserTasksWithStatus(targetUserId, statusFilter)
                    : await taskManagerModule.getAllUserTasksAllStatus(targetUserId);
            } else {
                const userId = interaction.user.id;
                tasks = statusFilter
                    ? await taskManagerModule.getAllUserTasksWithStatus(userId, statusFilter)
                    : await taskManagerModule.getAllUserTasksAllStatus(userId);
            }

            let newPage = currentPage;
            if (action === 'prev' && currentPage > 0) {
                newPage = currentPage - 1;
            } else if (action === 'next') {
                const sortedTasks = this.sortTasksForHistory([...tasks]);
                const totalPages = Math.ceil(sortedTasks.length / 5);
                if (currentPage < totalPages - 1) {
                    newPage = currentPage + 1;
                }
            }

            await interaction.deferUpdate();
            await this.sendPaginatedHistory(interaction, tasks, newPage, selectedStatus, targetUserId, true);
            return true;
        }

        return false;
    }

    registerInteractionHandlers(moduleManager) {
        moduleManager.registerInteractionHandler({
            customId: 'task_history_',
            type: 'button',
            handler: (interaction) => this.handleButtonInteraction(interaction)
        });
        moduleManager.registerInteractionHandler({
            customId: 'task_history_status_',
            type: 'select',
            handler: async (interaction) => {
                const targetUserId = interaction.customId.split('_')[3];
                const selectedStatus = interaction.values[0];
                await interaction.deferUpdate();
                await this.handleStatusSelection(interaction, selectedStatus, targetUserId);
                return true;
            }
        });
    }
}

module.exports = TaskHistoryCommand;