const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const BaseCommand = require('../../../utils/BaseCommand');

class AddNoteCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'note_add';
        this.description = 'Thêm ghi chú mới (sử dụng form)';
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
            // Check if this is a slash command interaction
            if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
                // Handle slash command with modal
                const modal = new ModalBuilder()
                    .setCustomId('note_add_modal')
                    .setTitle('📝 Thêm ghi chú mới');

                // Note content input
                const noteInput = new TextInputBuilder()
                    .setCustomId('note_content')
                    .setLabel('Nội dung ghi chú')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Nhập nội dung ghi chú của bạn...')
                    .setRequired(true)
                    .setMaxLength(1000);

                // Date input
                const dateInput = new TextInputBuilder()
                    .setCustomId('note_date')
                    .setLabel('Ngày hết hạn (tùy chọn)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('DD/MM/YYYY hoặc DD/MM (ví dụ: 25/12/2024)')
                    .setRequired(false)
                    .setMaxLength(10);

                // Time input
                const timeInput = new TextInputBuilder()
                    .setCustomId('note_time')
                    .setLabel('Thời gian hết hạn (tùy chọn)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('HH:MM (ví dụ: 14:30) - Mặc định 23:00 nếu có ngày')
                    .setRequired(false)
                    .setMaxLength(5);

                // Create action rows
                const firstActionRow = new ActionRowBuilder().addComponents(noteInput);
                const secondActionRow = new ActionRowBuilder().addComponents(dateInput);
                const thirdActionRow = new ActionRowBuilder().addComponents(timeInput);

                modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

                await interaction.showModal(modal);
                return;
            }

            // Handle prefix command (traditional message-based command)
            // interaction object from messageCreate is actually a fakeInteraction
            await this.handlePrefixCommand(interaction);

        } catch (error) {
            console.error('Error in note add command:', error);
            const content = '❌ Đã xảy ra lỗi khi xử lý lệnh thêm ghi chú.';

            if (interaction.reply) {
                await interaction.reply({ content, ephemeral: true });
            } else {
                await interaction.channel.send(content);
            }
        }
    } async handlePrefixCommand(message) {
        try {
            const prefix = this.getPrefix();
            // Ensure we have content property
            if (!message.content) {
                console.error('Message object missing content property:', message);
                return await message.channel.send('❌ Lỗi: Không thể đọc nội dung tin nhắn.');
            }

            const args = message.content.slice(prefix.length + this.name.length).trim().split(' ');

            if (args.length === 0 || args[0] === '') {
                return await message.channel.send(
                    `❌ **Cách sử dụng lệnh prefix:**\n` +
                    `\`${prefix}${this.name} <nội dung ghi chú> [--date DD/MM/YYYY] [--time HH:MM]\`\n\n` +
                    `**Ví dụ:**\n` +
                    `• \`${prefix}${this.name} Mua sữa cho em bé\`\n` +
                    `• \`${prefix}${this.name} Họp team --date 25/12/2024 --time 14:30\`\n` +
                    `• \`${prefix}${this.name} Gọi bác sĩ --date 20/12 --time 09:00\`\n\n` +
                    `💡 **Gợi ý:** Sử dụng \`/${this.name}\` để có giao diện form đẹp hơn!`
                );
            }

            // Parse arguments
            let noteContent = '';
            let dateString = null;
            let timeString = null;

            // Find --date and --time flags
            const dateIndex = args.findIndex(arg => arg === '--date');
            const timeIndex = args.findIndex(arg => arg === '--time');

            // Extract date if provided
            if (dateIndex !== -1 && dateIndex + 1 < args.length) {
                dateString = args[dateIndex + 1];
                args.splice(dateIndex, 2); // Remove --date and its value
            }

            // Extract time if provided (after removing date to avoid index issues)
            const newTimeIndex = args.findIndex(arg => arg === '--time');
            if (newTimeIndex !== -1 && newTimeIndex + 1 < args.length) {
                timeString = args[newTimeIndex + 1];
                args.splice(newTimeIndex, 2); // Remove --time and its value
            }

            // Remaining args are the note content
            noteContent = args.join(' ').trim();

            if (!noteContent) {
                return await message.channel.send('❌ Vui lòng nhập nội dung ghi chú.');
            }

            // Process the note creation
            await this.processNoteCreation(message, noteContent, dateString, timeString);

        } catch (error) {
            console.error('Error handling prefix command:', error);
            await message.channel.send('❌ Đã xảy ra lỗi khi xử lý lệnh prefix.');
        }
    }

    async processNoteCreation(context, noteContent, dateString, timeString) {
        try {
            const utilityModule = context.client.moduleManager.modules.get('utility');

            if (!utilityModule) {
                const content = `❌ Module ${this.module} chưa được khởi chạy.`;
                if (context.reply) {
                    return await context.reply({ content, ephemeral: true });
                } else {
                    return await context.channel.send(content);
                }
            }

            // Parse deadline if provided
            let deadline = null;
            let deadlineText = '';

            if (dateString || timeString) {
                deadline = utilityModule.parseDeadline(dateString, timeString);

                if (!deadline) {
                    const content = '❌ Định dạng ngày/giờ không hợp lệ.\n' +
                        '• **Ngày**: DD/MM/YYYY hoặc DD/MM (ví dụ: 25/12/2024 hoặc 25/12)\n' +
                        '• **Giờ**: HH:MM (ví dụ: 14:30)\n' +
                        '• Nếu chỉ có ngày: tự động đặt giờ 23:00\n' +
                        '• Nếu chỉ có giờ: tự động đặt ngày hôm nay';

                    if (context.reply) {
                        return await context.reply({ content, ephemeral: true });
                    } else {
                        return await context.channel.send(content);
                    }
                }

                // Check if deadline is in the past
                const now = new Date();
                if (deadline <= now) {
                    const content = '❌ Thời hạn không thể là thời điểm trong quá khứ.';
                    if (context.reply) {
                        return await context.reply({ content, ephemeral: true });
                    } else {
                        return await context.channel.send(content);
                    }
                }

                deadlineText = utilityModule.formatDeadlineVietnamese(deadline);
            }

            const userId = context.user ? context.user.id : context.author.id;
            const noteId = await utilityModule.createNote(userId, noteContent, deadline);

            if (!noteId) {
                const content = '❌ Đã xảy ra lỗi khi thêm ghi chú.';
                if (context.reply) {
                    return await context.reply({ content, ephemeral: true });
                } else {
                    return await context.channel.send(content);
                }
            }

            let responseMessage = `✅ Đã thêm ghi chú với ID: **${noteId}**\n📝 **Nội dung**: ${noteContent}`;

            if (deadline) {
                responseMessage += `\n⏰ **Hạn chót**: ${deadlineText}`;
                responseMessage += '\n🔔 Bot sẽ nhắc nhở bạn trước khi đến hạn: 2 tuần, 1 tuần, 3 ngày, 1 ngày và 1 tiếng.';
            }

            if (context.reply) {
                return await context.reply({ content: responseMessage });
            } else {
                return await context.channel.send(responseMessage);
            }

        } catch (error) {
            console.error('Error processing note creation:', error);
            const content = '❌ Đã xảy ra lỗi khi thêm ghi chú.';
            if (context.reply) {
                await context.reply({ content, ephemeral: true });
            } else {
                await context.channel.send(content);
            }
        }
    }

    async handleModalSubmit(interaction) {
        if (interaction.customId !== 'note_add_modal') return false;

        try {
            const noteContent = interaction.fields.getTextInputValue('note_content');
            const dateString = interaction.fields.getTextInputValue('note_date') || null;
            const timeString = interaction.fields.getTextInputValue('note_time') || null;

            // Use the common processing method
            await this.processNoteCreation(interaction, noteContent, dateString, timeString);

        } catch (error) {
            console.error('Error handling note add modal:', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi thêm ghi chú.',
                ephemeral: true
            });
        }

        return true;
    }
}

module.exports = AddNoteCommand;