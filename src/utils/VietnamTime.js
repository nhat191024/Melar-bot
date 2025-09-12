const moment = require('moment-timezone');

/**
 * Helper class for working with Vietnam timezone (Asia/Ho_Chi_Minh)
 */
class VietnamTime {
    static TIMEZONE = 'Asia/Ho_Chi_Minh';

    /**
     * Get current time in Vietnam timezone
     * @returns {moment.Moment}
     */
    static now() {
        return moment.tz(this.TIMEZONE);
    }

    /**
     * Create a specific date/time in Vietnam timezone
     * @param {string} dateString - Date string in format 'YYYY-MM-DD HH:mm:ss' or 'DD-MM-YYYY'
     * @param {string} format - Optional format string
     * @returns {moment.Moment}
     */
    static create(dateString, format = null) {
        if (format) {
            return moment.tz(dateString, format, this.TIMEZONE);
        }
        return moment.tz(dateString, this.TIMEZONE);
    }

    /**
     * Set specific time for today in Vietnam timezone
     * @param {number} hours - Hour (0-23)
     * @param {number} minutes - Minutes (0-59)
     * @param {number} seconds - Seconds (0-59, default: 0)
     * @returns {moment.Moment}
     */
    static todayAt(hours, minutes, seconds = 0) {
        return this.now().hours(hours).minutes(minutes).seconds(seconds).milliseconds(0);
    }

    /**
     * Parse time string and set for today
     * @param {string} timeString - Time in format 'HH:mm' or 'HH:mm:ss'
     * @returns {moment.Moment}
     */
    static parseTimeForToday(timeString) {
        const parts = timeString.split(':');
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parts[2] ? parseInt(parts[2], 10) : 0;

        return this.todayAt(hours, minutes, seconds);
    }

    /**
     * Parse date string and create moment object
     * @param {string} dateString - Date in format 'DD-MM-YYYY'
     * @returns {moment.Moment}
     */
    static parseDate(dateString) {
        const [day, month, year] = dateString.split('-').map(num => parseInt(num, 10));
        return this.now().year(year).month(month - 1).date(day).hours(0).minutes(0).seconds(0).milliseconds(0);
    }

    /**
     * Check if a time has passed today
     * @param {string} timeString - Time in format 'HH:mm'
     * @returns {boolean}
     */
    static hasTimePassed(timeString) {
        const timeToday = this.parseTimeForToday(timeString);
        return timeToday.isBefore(this.now());
    }

    /**
     * Get next occurrence of a specific time (today if not passed, tomorrow if passed)
     * @param {string} timeString - Time in format 'HH:mm'
     * @returns {moment.Moment}
     */
    static nextOccurrenceOf(timeString) {
        const timeToday = this.parseTimeForToday(timeString);

        if (timeToday.isBefore(this.now())) {
            return timeToday.add(1, 'day');
        }

        return timeToday;
    }

    /**
     * Calculate days until a specific date
     * @param {string} dateString - Date in format 'DD-MM-YYYY'
     * @returns {number}
     */
    static daysUntil(dateString) {
        const targetDate = this.parseDate(dateString);
        const today = this.now().startOf('day');
        return Math.max(0, targetDate.diff(today, 'days'));
    }

    /**
     * Create reminder dates for a deadline
     * @param {string} dateString - Deadline in format 'DD-MM-YYYY'
     * @param {number[]} reminderDays - Days before deadline to remind [14, 7, 3, 1]
     * @returns {moment.Moment[]}
     */
    static createReminderDates(dateString, reminderDays = [14, 7, 3, 1]) {
        const deadline = this.parseDate(dateString);
        const daysUntilDeadline = this.daysUntil(dateString);
        const reminders = [];

        reminderDays.forEach(days => {
            if (daysUntilDeadline >= days) {
                const reminderDate = deadline.clone().subtract(days, 'days');
                reminders.push(reminderDate);
            }
        });

        return reminders;
    }

    /**
     * Format moment object to common Vietnam formats
     * @param {moment.Moment} momentObj
     * @returns {Object}
     */
    static formatVN(momentObj) {
        return {
            date: momentObj.format('DD/MM/YYYY'),
            dateTime: momentObj.format('DD/MM/YYYY HH:mm'),
            dateTimeFull: momentObj.format('DD/MM/YYYY HH:mm:ss'),
            timeOnly: momentObj.format('HH:mm'),
            dayName: momentObj.format('dddd'),
            fullDisplay: momentObj.format('dddd, DD/MM/YYYY [lúc] HH:mm'),
            iso: momentObj.format('YYYY-MM-DD HH:mm:ss')
        };
    }

    /**
     * Convert to JavaScript Date object (for database storage or other APIs)
     * @param {moment.Moment} momentObj
     * @returns {Date}
     */
    static toDate(momentObj) {
        return momentObj.toDate();
    }

    /**
     * Add 23 hours from now (for default reminders)
     * @returns {Date}
     */
    static defaultReminderTime() {
        return this.now().add(23, 'hours').toDate();
    }
}

module.exports = VietnamTime;

// Example usage:
if (require.main === module) {
    console.log('=== VIETNAM TIME HELPER EXAMPLES ===\n');

    // Current time
    const now = VietnamTime.now();
    console.log('1. Current time:', VietnamTime.formatVN(now).fullDisplay);

    // Set time for today
    const at3PM = VietnamTime.todayAt(15, 0);
    console.log('2. Today at 3PM:', VietnamTime.formatVN(at3PM).dateTime);

    // Parse time string
    const parsed = VietnamTime.parseTimeForToday('14:30');
    console.log('3. Parsed 14:30 for today:', VietnamTime.formatVN(parsed).dateTime);

    // Check if time has passed
    console.log('4. Has 14:30 passed today?', VietnamTime.hasTimePassed('14:30'));
    console.log('   Has 23:59 passed today?', VietnamTime.hasTimePassed('23:59'));

    // Next occurrence
    const nextTime = VietnamTime.nextOccurrenceOf('09:00');
    console.log('5. Next 9AM:', VietnamTime.formatVN(nextTime).fullDisplay);

    // Days until deadline
    const daysLeft = VietnamTime.daysUntil('25-09-2025');
    console.log('6. Days until 25/09/2025:', daysLeft);

    // Create reminders
    const reminders = VietnamTime.createReminderDates('25-09-2025');
    console.log('7. Reminder dates for 25/09/2025:');
    reminders.forEach((reminder, index) => {
        console.log(`   Reminder ${index + 1}:`, VietnamTime.formatVN(reminder).date);
    });

    // Default reminder (23 hours from now)
    const defaultReminder = VietnamTime.defaultReminderTime();
    console.log('8. Default reminder (23h from now):', defaultReminder);
}