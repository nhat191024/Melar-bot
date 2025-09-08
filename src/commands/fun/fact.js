const { EmbedBuilder } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class FactCommand extends BaseCommand {
    constructor() {
        super({
            name: 'fact',
            description: 'Get a random interesting fact',
            category: 'fun',
            module: 'fun',
            cooldown: 5
        });
    }

    getSlashCommandData() {
        return super.getSlashCommandData()
            .addBooleanOption(option =>
                option.setName('ephemeral')
                    .setDescription('Only you can see the fact')
                    .setRequired(false)
            );
    }

    async execute(interaction) {
        const ephemeral = interaction.options.getBoolean('ephemeral') || false;

        // Get the fun module instance
        const funModule = interaction.client.moduleManager.getModule('fun');

        if (!funModule) {
            await interaction.reply({
                content: 'Fun module is not loaded!',
                ephemeral: true
            });
            return;
        }

        const fact = funModule.getRandomFact();

        const embed = new EmbedBuilder()
            .setColor('#00CED1')
            .setTitle('🧠 Did You Know?')
            .setDescription(fact)
            .setFooter({ text: 'Learn something new every day!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral });
    }
}

module.exports = FactCommand;
