const { SlashCommandBuilder, ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class AddTaskCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'task_add';
        this.description = 'Thêm một công việc mới';
        this.category = 'productivity';
        this.module = 'taskManager';
        this.cooldown = 2;
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Thêm một công việc mới')
            .addStringOption(option =>
                option.setName('title')
                    .setDescription('Tiêu đề công việc')
                    .setRequired(true))
            .addUserOption(option =>
                option.setName('assignee')
                    .setDescription('Người được giao công việc')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('description')
                    .setDescription('Mô tả công việc')
                    .setRequired(false))
            .addStringOption(option =>
                option.setName('link')
                    .setDescription('Link liên quan đến công việc')
                    .setRequired(false))
            .addStringOption(option =>
                option.setName('deadline-time')
                    .setDescription('Thời gian hạn chót cho công việc (HH:MM 24h) (14:30)')
                    .setRequired(false))
            .addStringOption(option =>
                option.setName('deadline-date')
                    .setDescription('Ngày hạn chót cho công việc (DD-MM-YYYY) (19-10-2025)')
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

            if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
                let title, description, link, time, date;
                let assigneeIds = [];

                title = interaction.options.getString('title');
                assigneeIds.push(interaction.options.getUser('assignee').id);
                description = interaction.options.getString('description');
                link = interaction.options.getString('link');
                time = interaction.options.getString('deadline-time');
                date = interaction.options.getString('deadline-date');

                const success = await taskManagerModule.createTask(title, assigneeIds, interaction.user.id, description, link, time, date, interaction.channelId);

                if (success) {
                    await interaction.reply({ content: '✅ Công việc đã được thêm thành công.' });
                }
                return;
            } else {
                await this.handlePrefix(interaction, taskManagerModule);
                return;
            }
        } catch (error) {
            console.error('Error adding task:', error);
            await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi thêm tác vụ.'
            });
        }
    }

    async handlePrefix(interaction, taskManagerModule) {
        const prefix = this.getPrefix();
        let title, description, link, time, date;
        let assigneesTag = [];
        let assigneesId = [];

        interaction._originalMessage.mentions.users.forEach(user => {
            if (user.id !== interaction.user.id && !user.bot) {
                assigneesTag.push(user.tag);
                assigneesId.push(user.id);
            }
        });

        const args = interaction._originalMessage.content.slice(prefix.length + this.name.length).trim().split(' ');

        if (args.length === 0 || args[0] === '') {
            return await interaction._originalMessage.channel.send(
                `❌ **Cách sử dụng lệnh prefix:**\n` +
                `\`${prefix}${this.name} @<người dùng>\`` +
                `Sau đó bấm xác nhận và điền các thông tin cần thiết.\n` +
                `\n` +
                `**Ví dụ:**\n` +
                `\`${prefix}${this.name} @Melar @AnotherUser\`\n\n` +
                `**Lưu ý:**\n` +
                `• Bạn có thể tag nhiều người dùng để giao công việc cho họ.\n` +
                `• Đảm bảo rằng các người dùng được tag là hợp lệ và không phải bot.\n` +
                `• Sử dụng \`/${this.name}\` chỉ có thể giao việc cho 1 user\n`
            );
        }

        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('Nhận được yêu cầu thêm task mới!')
            .setDescription('Công việc sẽ được giao cho các thành viên sau:');
        if (assigneesTag.length > 0) {
            embed.addFields({ name: 'Người được giao', value: `${assigneesTag.join(', ')}`, inline: true });
        }
        embed.addFields({ name: 'Người tạo', value: `${interaction.user}`, inline: true });
        embed.setFooter({ text: 'Vui lòng bấm xác nhận để điền các thông tin cần thiết.' });

        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('taskAddConfirm')
                    .setLabel('Xác nhận')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('taskAddCancel')
                    .setLabel('Hủy')
                    .setStyle(ButtonStyle.Danger),
            );

        const confirmMessage = await interaction.reply({ embeds: [embed], components: [buttons] });

        // Sử dụng collector cho prefix command
        const filter = i => i.user.id === interaction.user.id;
        const collector = confirmMessage.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'taskAddConfirm') {
                const modal = await this.buildModal();
                await i.showModal(modal);

                // Chờ modal submit
                const modalFilter = m => m.user.id === interaction.user.id;
                try {
                    const submitted = await i.awaitModalSubmit({ filter: modalFilter, time: 300000 });
                    title = submitted.fields.getTextInputValue('titleInput');
                    description = submitted.fields.getTextInputValue('descriptionInput') || null;
                    link = submitted.fields.getTextInputValue('linkInput') || null;
                    time = submitted.fields.getTextInputValue('timeInput') || null;
                    date = submitted.fields.getTextInputValue('dateInput') || null;

                    await submitted.reply({ content: '✅ Đang tạo công việc...' });

                    // Tạo task
                    const success = await taskManagerModule.createTask(title, assigneesId, interaction.user.id, description, link, time, date, interaction.channelId);

                    if (success) {
                        await submitted.editReply({ content: '✅ Công việc đã được thêm thành công.' });
                    }

                } catch (modalError) {
                    console.error('Modal submit error:', modalError);
                    await i.followUp({ content: '❌ Đã xảy ra lỗi khi gửi modal.', ephemeral: true });
                }
            } else if (i.customId === 'taskAddCancel') {
                await i.update({ content: '❌ Đã hủy tạo công việc.', embeds: [], components: [] });
            }
            collector.stop();
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                await confirmMessage.edit({ content: '❌ Thời gian chờ đã hết. Vui lòng thử lại.', embeds: [], components: [] });
            }
        });
    }

    async buildModal() {
        const modal = new ModalBuilder()
            .setCustomId('taskAddModal')
            .setTitle('Thêm công việc mới');

        const titleInput = new TextInputBuilder()
            .setCustomId('titleInput')
            .setLabel('Tiêu đề công việc (bắt buộc)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Nhập tiêu đề công việc')
            .setMaxLength(100);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('descriptionInput')
            .setLabel('Mô tả công việc (tùy chọn)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setPlaceholder('Nhập mô tả công việc')
            .setMaxLength(500);

        const linkInput = new TextInputBuilder()
            .setCustomId('linkInput')
            .setLabel('Link liên quan (tùy chọn)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('Nhập link liên quan')
            .setMaxLength(200);

        const timeInput = new TextInputBuilder()
            .setCustomId('timeInput')
            .setLabel('Thời gian hạn chót (HH:MM)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('Ví dụ: 14:30')
            .setMaxLength(5);

        const dateInput = new TextInputBuilder()
            .setCustomId('dateInput')
            .setLabel('Ngày hạn chót (DD-MM-YYYY)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setPlaceholder('Ví dụ: 19-10-2025')
            .setMaxLength(10);

        const firstRow = new ActionRowBuilder().addComponents(titleInput);
        const secondRow = new ActionRowBuilder().addComponents(descriptionInput);
        const thirdRow = new ActionRowBuilder().addComponents(linkInput);
        const fourthRow = new ActionRowBuilder().addComponents(timeInput);
        const fifthRow = new ActionRowBuilder().addComponents(dateInput);

        modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);

        return modal;
    }
}

module.exports = AddTaskCommand;