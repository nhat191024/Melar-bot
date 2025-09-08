class BaseEvent {
    constructor(options = {}) {
        this.name = options.name || 'unknown';
        this.once = options.once || false;
        this.enabled = options.enabled !== false;
        this.module = options.module || 'core';
    }

    // Override this method in your events
    async execute(...args) {
        throw new Error(`Event ${this.name} does not have an execute method`);
    }
}

module.exports = BaseEvent;
