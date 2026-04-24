const BaseEvent = require('../../utils/BaseEvent');
const Logger = require('../../utils/Logger');
const Config = require('../../utils/Config');

class MessageCreateEvent extends BaseEvent {
    constructor() {
        super({
            name: 'messageCreate',
            module: 'core'
        });
    }

    async execute(message) {
        // Ignore bot messages
        if (message.author.bot) return;

        const prefix = Config.get('prefix');

        // Check if message starts with prefix
        if (!message.content.startsWith(prefix)) return;

        // Parse command and arguments
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Get command from module manager
        const command = message.client.moduleManager.getCommand(commandName);

        if (!command) return; // Command not found, ignore silently

        // Check if command is enabled
        if (!command.enabled) {
            await message.reply('Lệnh này hiện đang bị tắt!');
            return;
        }

        // Check if module is enabled
        if (!message.client.moduleManager.isModuleEnabled(command.module)) {
            await message.reply('Module của lệnh này hiện đang bị tắt!');
            return;
        }

        // Check permissions (for guild messages)
        if (message.guild && !command.hasPermissions(message.member)) {
            await message.reply('Bạn không có quyền sử dụng lệnh này!');
            return;
        }

        // Check cooldown
        const cooldownLeft = command.checkCooldown(message.author.id, message.client.moduleManager.cooldowns);
        if (cooldownLeft) {
            await message.reply(`Vui lòng chờ ${cooldownLeft.toFixed(1)} giây trước khi sử dụng lại lệnh này.`);
            return;
        }

        try {
            // Create a fake interaction object for compatibility
            const fakeInteraction = this.createFakeInteraction(message, args);

            await command.execute(fakeInteraction);
        } catch (error) {
            Logger.error(`Error executing prefix command ${commandName}: ${error.message}`);
            await message.reply('Đã xảy ra lỗi khi thực thi lệnh này!');
        }
    }

    // Create a fake interaction object to maintain compatibility with slash commands
    createFakeInteraction(message, args) {
        return {
            // Basic properties
            user: message.author,
            member: message.member,
            guild: message.guild,
            channel: message.channel,
            channelId: message.channel.id,
            client: message.client,
            createdTimestamp: message.createdTimestamp,
            content: message.content,

            // Fake interaction methods
            isSlashCommand: () => false,
            isPrefixCommand: () => true,
            isChatInputCommand: () => false,

            reply: async (options) => {
                if (typeof options === 'string') {
                    return await message.reply(options);
                }
                return await message.reply(options);
            },

            followUp: async (options) => {
                if (typeof options === 'string') {
                    return await message.channel.send(options);
                }
                return await message.channel.send(options);
            },

            editReply: async (options) => {
                // For prefix commands, we can't edit the reply, so send a new message
                if (typeof options === 'string') {
                    return await message.channel.send(`📝 Updated: ${options}`);
                }
                return await message.channel.send({ content: '📝 Updated:', ...options });
            },

            deferReply: async () => {
                // For prefix commands, we can show typing indicator
                await message.channel.sendTyping();
            },

            // Simple options system for prefix commands
            options: {
                getString: (name) => args.length ? args.join(' ') : null,
                getInteger: (name) => {
                    const value = parseInt(args[0]);
                    return isNaN(value) ? null : value;
                },
                getBoolean: (name) => {
                    const value = args[0]?.toLowerCase();
                    return value === 'true' || value === 'yes' || value === '1';
                },
                getUser: (name) => {
                    const mention = args[0];
                    if (!mention) return null;
                    const matches = mention.match(/^<@!?(\d+)>$/);
                    return matches ? message.client.users.cache.get(matches[1]) : null;
                }
            },

            // Store original message for advanced use
            _originalMessage: message,
            _args: args
        };
    }
}

module.exports = MessageCreateEvent;
