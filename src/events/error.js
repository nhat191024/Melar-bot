const BaseEvent = require('../utils/BaseEvent');
const Logger = require('../utils/Logger');

class ErrorEvent extends BaseEvent {
    constructor() {
        super({
            name: 'error',
            module: 'core'
        });
    }

    async execute(error) {
        Logger.error(`Discord client error: ${error.message}`);
    }
}

module.exports = ErrorEvent;
