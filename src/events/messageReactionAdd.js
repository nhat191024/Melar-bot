const BaseEvent = require('../utils/BaseEvent');
const Logger = require('../utils/Logger');

class MessageReactionAddEvent extends BaseEvent {
    constructor() {
        super({
            name: 'messageReactionAdd',
            module: 'core'
        });
    }

    async execute(reaction, user) {
        try {
            // Ignore bot reactions
            if (user.bot) return;

            // Fetch the reaction if it's partial
            if (reaction.partial) {
                try {
                    await reaction.fetch();
                } catch (error) {
                    Logger.error('Failed to fetch partial reaction:', error.message);
                    return;
                }
            }

            // Get all modules that might handle reactions
            const modules = reaction.client.moduleManager.modules;

            // Pass the reaction to all modules that have handleReaction method
            for (const [name, module] of modules) {
                if (typeof module.handleReaction === 'function') {
                    try {
                        await module.handleReaction(reaction, user);
                    } catch (error) {
                        Logger.error(`Error in ${name} module handleReaction: ${error.message}`);
                    }
                }
            }
        } catch (error) {
            Logger.error(`Error in messageReactionAdd event: ${error.message}`);
        }
    }
}

module.exports = MessageReactionAddEvent;

module.exports = MessageReactionAddEvent;
