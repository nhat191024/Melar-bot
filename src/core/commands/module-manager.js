const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BaseCommand = require('../../utils/BaseCommand');
const Config = require('../../utils/Config');

class ModuleManagerCommand extends BaseCommand {
    constructor() {
        super();
        this.name = 'module_manager';
        this.description = 'Manage bot modules (admin only)';
        this.category = 'Admin';
        this.cooldown = 5000;
        this.permissions = [PermissionFlagsBits.Administrator];
    }

    getSlashCommandData() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription(this.description)
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List all available modules'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('toggle')
                    .setDescription('Enable or disable a module')
                    .addStringOption(option =>
                        option.setName('module')
                            .setDescription('Module name to toggle')
                            .setRequired(true))
                    .addBooleanOption(option =>
                        option.setName('enabled')
                            .setDescription('Enable (true) or disable (false) the module')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('info')
                    .setDescription('Get detailed information about a module')
                    .addStringOption(option =>
                        option.setName('module')
                            .setDescription('Module name to get info about')
                            .setRequired(true)))
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
    }

    async execute(interaction) {
        try {
            if (this.isSlashCommand(interaction)) {
                const subcommand = interaction.options.getSubcommand();

                switch (subcommand) {
                    case 'list':
                        return await this.handleList(interaction);
                    case 'toggle':
                        const moduleName = interaction.options.getString('module');
                        const enabled = interaction.options.getBoolean('enabled');
                        return await this.handleToggle(interaction, moduleName, enabled);
                    case 'info':
                        const infoModule = interaction.options.getString('module');
                        return await this.handleInfo(interaction, infoModule);
                }
            } else {
                // Prefix command support
                const commandArgs = interaction._args || [];

                if (commandArgs.length === 0 || commandArgs[0] === 'list') {
                    return await this.handleList(interaction);
                } else if (commandArgs[0] === 'toggle' && commandArgs.length >= 3) {
                    const moduleName = commandArgs[1];
                    const enabled = commandArgs[2].toLowerCase() === 'true';
                    return await this.handleToggle(interaction, moduleName, enabled);
                } else if (commandArgs[0] === 'info' && commandArgs.length >= 2) {
                    return await this.handleInfo(interaction, commandArgs[1]);
                } else {
                    return await interaction.reply({
                        content: '❌ Cách dùng: `!module-manager [list|toggle|info|add]`',
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Error in module manager command:', error);
            return await interaction.reply({
                content: '❌ Đã xảy ra lỗi khi quản lý modules.',
                ephemeral: true
            });
        }
    }

    async handleList(interaction) {
        const modules = Config.getAllModules();
        const moduleNames = Object.keys(modules);

        if (moduleNames.length === 0) {
            return await interaction.reply({
                content: '📝 Không tìm thấy module nào.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🔧 Quản lý Module Bot')
            .setDescription(`Tìm thấy ${moduleNames.length} module`)
            .setColor(0x5865F2)
            .setTimestamp()
            .setFooter({ text: `${interaction.guild.name}`, iconURL: interaction.guild.iconURL() });

        // Group modules by category
        const categories = {};
        for (const [name, config] of Object.entries(modules)) {
            const category = config.category || 'Other';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push({ name, config });
        }

        for (const [category, moduleList] of Object.entries(categories)) {
            let fieldValue = '';
            moduleList.forEach(({ name, config }) => {
                const status = config.enabled ? '✅' : '❌';
                const commands = config.commands ? ` (${config.commands.length} cmd)` : '';
                fieldValue += `${status} **${name}**${commands}\n`;
            });

            embed.addFields({
                name: `📂 ${category}`,
                value: fieldValue || 'Không có module',
                inline: true
            });
        }

        embed.addFields({
            name: '💡 Hướng dẫn',
            value: '• `/module_manager toggle <module> true/false` - Bật/tắt module\n' +
                '• `/module_manager info <module>` - Xem thông tin chi tiết\n' +
                '• `/module_manager add <name> <description>` - Thêm module mới',
            inline: false
        });

        return await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }

    async handleToggle(interaction, moduleName, enabled) {
        const moduleConfig = Config.getModuleConfig(moduleName);

        if (!moduleConfig) {
            return await interaction.reply({
                content: `❌ Không tìm thấy module '${moduleName}'. Sử dụng \`/module_manager list\` để xem danh sách.`,
                ephemeral: true
            });
        }

        const success = Config.toggleModule(moduleName, enabled);

        if (success) {
            const status = enabled ? 'bật' : 'tắt';
            const emoji = enabled ? '✅' : '❌';

            return await interaction.reply({
                content: `${emoji} **Đã ${status} module '${moduleName}'!**\n\n` +
                    `📝 **Trạng thái:** ${enabled ? 'Hoạt động' : 'Tạm dừng'}\n` +
                    `💾 **Lưu ý:** Thay đổi đã được lưu vào file config.`,
                ephemeral: true
            });
        } else {
            return await interaction.reply({
                content: `❌ Không thể thay đổi trạng thái module '${moduleName}'.`,
                ephemeral: true
            });
        }
    }

    async handleInfo(interaction, moduleName) {
        const moduleConfig = Config.getModuleConfig(moduleName);
        const isEnabled = Config.isModuleEnabled(moduleName);

        if (!moduleConfig) {
            return await interaction.reply({
                content: `❌ Không tìm thấy module '${moduleName}'. Sử dụng \`/module_manager list\` để xem danh sách.`,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔧 Module: ${moduleName}`)
            .setDescription(moduleConfig.description || 'Không có mô tả')
            .setColor(isEnabled ? 0x00ff00 : 0xff0000)
            .setTimestamp();

        embed.addFields(
            {
                name: '📊 Trạng thái',
                value: isEnabled ? '✅ Đang hoạt động' : '❌ Tạm dừng',
                inline: true
            },
            {
                name: '📂 Danh mục',
                value: moduleConfig.category || 'Không xác định',
                inline: true
            },
            {
                name: '⚡ Commands',
                value: moduleConfig.commands && moduleConfig.commands.length > 0
                    ? `${moduleConfig.commands.length} lệnh: \`${moduleConfig.commands.join('`, `')}\``
                    : 'Không có lệnh',
                inline: false
            }
        );

        if (moduleConfig.dependencies && moduleConfig.dependencies.length > 0) {
            embed.addFields({
                name: '🔗 Dependencies',
                value: moduleConfig.dependencies.join(', '),
                inline: true
            });
        }

        // Add toggle buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`module_enable_${moduleName}`)
                    .setLabel('Bật Module')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(isEnabled),
                new ButtonBuilder()
                    .setCustomId(`module_disable_${moduleName}`)
                    .setLabel('Tắt Module')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(!isEnabled)
            );

        return await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });
    }
}

module.exports = ModuleManagerCommand;
