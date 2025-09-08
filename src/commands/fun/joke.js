const { EmbedBuilder } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');

class JokeCommand extends BaseCommand {
    constructor() {
        super({
            name: 'joke',
            description: 'Get a random joke',
            category: 'fun',
            module: 'fun',
            cooldown: 3
        });
    }

    getSlashCommandData() {
        return super.getSlashCommandData()
            .addBooleanOption(option =>
                option.setName('ephemeral')
                    .setDescription('Only you can see the joke')
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

        const joke = funModule.getRandomJoke();

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('😂 Random Joke')
            .setDescription(joke)
            .setFooter({ text: 'Hope this made you smile!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral });
    }
}

module.exports = JokeCommand;
