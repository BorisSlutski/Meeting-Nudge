const schedule = require('node-schedule');

/**
 * Scheduler for meeting reminders
 */
class Scheduler {
  constructor(store, onReminder) {
    this.store = store;
    this.onReminder = onReminder;
    this.scheduledJobs = new Map();
    this.events = [];
  }

  /**
   * Update events and reschedule reminders
   * @param {Array} events - Array of calendar events
   */
  updateEvents(events) {
    this.events = events;
    this.rescheduleAll();
  }

  /**
   * Cancel all existing jobs and reschedule
   */
  rescheduleAll() {
    // Cancel all existing jobs
    for (const job of this.scheduledJobs.values()) {
      job.cancel();
    }
    this.scheduledJobs.clear();

    const reminderTimes = this.store.get('reminderTimes') || [10, 5, 1];
    const now = new Date();

    for (const event of this.events) {
      const eventStart = new Date(event.start);
      
      // Skip past events
      if (eventStart <= now) {
        continue;
      }

      // Schedule reminders for each reminder time
      for (const minutesBefore of reminderTimes) {
        const reminderTime = new Date(eventStart.getTime() - minutesBefore * 60 * 1000);
        
        // Skip if reminder time is in the past
        if (reminderTime <= now) {
          continue;
        }

        const jobId = `${event.id}-${minutesBefore}`;
        
        const job = schedule.scheduleJob(reminderTime, () => {
          console.log(`Triggering reminder for: ${event.title} (${minutesBefore} min before)`);
          this.onReminder({
            ...event,
            reminderMinutes: minutesBefore
          });
        });

        if (job) {
          this.scheduledJobs.set(jobId, job);
          console.log(`Scheduled reminder: ${event.title} at ${reminderTime.toLocaleString()} (${minutesBefore} min before)`);
        }
      }
    }

    console.log(`Scheduled ${this.scheduledJobs.size} reminders`);
  }

  /**
   * Get next scheduled reminder
   * @returns {Object|null} Next scheduled event or null
   */
  getNextReminder() {
    const now = new Date();
    let nextEvent = null;
    let nextTime = null;

    for (const event of this.events) {
      const eventStart = new Date(event.start);
      if (eventStart > now) {
        if (!nextTime || eventStart < nextTime) {
          nextEvent = event;
          nextTime = eventStart;
        }
      }
    }

    return nextEvent;
  }

  /**
   * Cancel all scheduled jobs
   */
  cancelAll() {
    for (const job of this.scheduledJobs.values()) {
      job.cancel();
    }
    this.scheduledJobs.clear();
  }
}

module.exports = { Scheduler };
