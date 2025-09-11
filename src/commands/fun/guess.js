const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class NumberGuessCommand extends BaseCommand {
    constructor() {
        super({
            name: 'guess',
            description: 'Chơi trò đoán số',
            category: 'fun',
            module: 'fun',
            cooldown: 10
        });
    }

    getSlashCommandData() {
        return super.getSlashCommandData()
            .addIntegerOption(option =>
                option.setName('max')
                    .setDescription('Số lớn nhất để đoán (mặc định: 10)')
                    .setRequired(false)
                    .setMinValue(10)
                    .setMaxValue(100)
            )
            .addStringOption(option =>
                option.setName('rule')
                    .setDescription('Hiển thị luật chơi')
                    .setRequired(false)
            );
    }

    async execute(interaction) {
        const funModule = interaction.client.moduleManager.getModule('fun');

        if (!funModule) {
            await interaction.reply({
                content: 'Module vui chưa được tải!',
                ephemeral: true
            });
            return;
        }

        // Check if game is already active in this channel
        if (funModule.isGameActive(interaction.channelId)) {
            await interaction.reply({
                content: 'Đang có trò chơi hoạt động trong kênh này! Hãy hoàn thành trước.',
                ephemeral: true
            });
            return;
        }

        console.log(interaction.options.getString('rule'));

        // If 'rule' option is provided, show the rules
        if (interaction.options.getString('rule') === 'rule' || interaction.options.getString('rule') === 'true') {
            const rulesEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📜 Luật chơi đoán số')
                .setDescription(
                    [
                        'Bạn sẽ có một số lượt đoán để tìm ra số bí mật trong khoảng từ 1 đến {maxNumber}.',
                        'Mỗi lần đoán, bot sẽ cho bạn biết số của bạn lớn hơn hay nhỏ hơn số bí mật.',
                        'Hãy cố gắng đoán đúng trong số lượt cho phép!',
                        '',
                        'Cách chơi: !guess [max] (max là số lớn nhất, mặc định 10) hoặc dùng lệnh /guess với tùy chọn max.',
                        '',
                        '**Lưu ý:**',
                        '- Nếu khoảng số lớn hơn 20, bạn sẽ cần nhập số đoán bằng tay thay vì dùng nút bấm.',
                        '- Nếu MaxNumber ≤ 10: Điểm số sẽ giảm còn (50% điểm).',
                        '- Nếu MaxNumber ≤ 20: Điểm số sẽ giảm còn (70% điểm).',
                        '- Nếu MaxNumber > 20: Bạn sẽ nhận được điểm đầy đủ.'
                    ].join('\n')
                );
            await interaction.reply({ embeds: [rulesEmbed], ephemeral: true });
            return;
        }

        const maxNumber = interaction.options.getInteger('max') || 10;
        const secretNumber = Math.floor(Math.random() * maxNumber) + 1;
        const maxAttempts = Math.ceil(maxNumber / 3);

        if (maxNumber < 10 || maxNumber > 100) {
            await interaction.reply({
                content: 'Vui lòng chọn số lớn nhất trong khoảng từ 10 đến 100.',
                ephemeral: true
            });
            return;
        }

        // Start the game
        funModule.startGame(interaction.channelId, 'number_guess', {
            secretNumber,
            maxNumber,
            attempts: 0,
            maxAttempts,
            playerId: interaction.user.id,
            startTime: Date.now()
        });

        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('🎯 Trò chơi đoán số')
            .setDescription(`Tôi đang nghĩ đến một số từ 1 đến ${maxNumber}!\nBạn có ${maxAttempts} lượt đoán.`)
            .addFields(
                { name: 'Cách chơi', value: 'Dùng các nút bên dưới để đoán số!' },
                { name: 'Lượt còn lại', value: `${maxAttempts}`, inline: true },
                { name: 'Khoảng số', value: `1 - ${maxNumber}`, inline: true }
            )
            .setFooter({ text: `Trò chơi bắt đầu bởi ${interaction.user.username}` })
            .setTimestamp();

        // Create number buttons (for smaller ranges)
        const rows = [];
        if (maxNumber <= 20) {
            for (let i = 0; i < Math.ceil(maxNumber / 5); i++) {
                const row = new ActionRowBuilder();
                for (let j = 1; j <= 5 && (i * 5 + j) <= maxNumber; j++) {
                    const number = i * 5 + j;
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`guess_${number}`)
                            .setLabel(number.toString())
                            .setStyle(ButtonStyle.Primary)
                    );
                }
                rows.push(row);
            }
        } else {
            // For larger ranges, provide hint buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('guess_hint')
                        .setLabel('Gợi ý')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('guess_quit')
                        .setLabel('Thoát trò chơi')
                        .setStyle(ButtonStyle.Danger)
                );
            rows.push(row);

            embed.addFields({
                name: 'Chế độ khoảng lớn',
                value: 'Gõ số bạn đoán hoặc dùng nút để nhận gợi ý!'
            });
        }

        await interaction.reply({ embeds: [embed], components: rows });

        // Set up message collector for number input (for larger ranges)
        if (maxNumber > 20) {
            const filter = m => m.author.id === interaction.user.id && !isNaN(m.content);
            const collector = interaction.channel.createMessageCollector({
                filter,
                time: 300000 // 5 phút
            });

            collector.on('collect', async (message) => {
                const game = funModule.getActiveGame(interaction.channelId);
                if (!game || game.type !== 'number_guess') {
                    collector.stop();
                    return;
                }

                const guess = parseInt(message.content);
                await this.processGuess(interaction, guess, funModule);

                if (!funModule.isGameActive(interaction.channelId)) {
                    collector.stop();
                }
            });

            collector.on('end', () => {
                if (funModule.isGameActive(interaction.channelId)) {
                    funModule.endGame(interaction.channelId);
                    interaction.followUp('⏰ Hết thời gian! Trò chơi đã kết thúc.');
                }
            });
        }
    }

    async processGuess(interaction, guess, funModule) {
        const game = funModule.getActiveGame(interaction.channelId);
        if (!game) return;

        game.attempts++;
        const { secretNumber, maxAttempts, maxNumber } = game;

        let resultEmbed;
        let gameEnded = false;

        if (guess === secretNumber) {
            // Correct guess!
            let score = Math.max(100 - (game.attempts - 1) * 10, 10);
            if (maxNumber <= 10) {
                score = Math.floor(score * 0.5);
            } else if (maxNumber <= 20) {
                score = Math.floor(score * 0.7);
            } else {
                score = Math.floor(score * 1);
            }
            const duration = Math.floor((Date.now() - game.startTime) / 1000);

            await funModule.updateUserStats(interaction.user.id, interaction.user.username, {
                won: true,
                score: score,
                gameType: 'number_guess',
                attempts: game.attempts,
                duration: duration
            });

            resultEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎉 Chúc mừng!')
                .setDescription(`Bạn đã đoán đúng! Số bí mật là **${secretNumber}**.`)
                .addFields(
                    { name: 'Số lần đoán', value: `${game.attempts}/${maxAttempts}`, inline: true },
                    { name: 'Điểm số', value: `${score} điểm`, inline: true }
                )
                .setFooter({ text: `Làm tốt lắm, ${interaction.user.username}!` });

            gameEnded = true;
        } else if (game.attempts >= maxAttempts) {
            // Out of attempts
            const duration = Math.floor((Date.now() - game.startTime) / 1000);

            await funModule.updateUserStats(interaction.user.id, interaction.user.username, {
                won: false,
                score: 0,
                gameType: 'number_guess',
                attempts: game.attempts,
                duration: duration
            });

            resultEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('😞 Thua cuộc!')
                .setDescription(`Bạn đã hết lượt đoán! Số bí mật là **${secretNumber}**.`)
                .addFields(
                    { name: 'Số lần đoán', value: `${game.attempts}/${maxAttempts}`, inline: true }
                )
                .setFooter({ text: 'Chúc may mắn lần sau!' });

            gameEnded = true;
        } else {
            // Wrong guess, give hint
            const hint = guess > secretNumber ? 'lớn' : 'nhỏ';
            const hint2 = guess < secretNumber ? 'lớn hơn' : 'nhỏ hơn';
            const attemptsLeft = maxAttempts - game.attempts;

            resultEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('🤔 Đoán lại nhé!')
                .setDescription(`**${guess}** quá ${hint}! Hãy thử số ${hint2}.`)
                .addFields(
                    { name: 'Lượt còn lại', value: `${attemptsLeft}`, inline: true },
                    { name: 'Khoảng số', value: `1 - ${maxNumber}`, inline: true }
                )
                .setFooter({ text: 'Tiếp tục cố gắng nhé!' });
        }

        if (gameEnded) {
            funModule.endGame(interaction.channelId);
        }

        await interaction.followUp({ embeds: [resultEmbed] });
    }
}

module.exports = NumberGuessCommand;
