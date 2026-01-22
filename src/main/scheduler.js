const schedule = require('node-schedule');

/**
 * Scheduler for meeting reminders
 */
class Scheduler {
  constructor(store, onReminder, onPreviewNotification) {
    this.store = store;
    this.onReminder = onReminder;
    this.onPreviewNotification = onPreviewNotification; // Optional preview callback
    this.scheduledJobs = new Map();
    this.previewJobs = new Map(); // Track preview notification jobs
    this.snoozedJobs = new Map(); // Track snoozed reminders
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
    
    for (const job of this.previewJobs.values()) {
      job.cancel();
    }
    this.previewJobs.clear();

    const reminderTimes = this.store.get('reminderTimes') || [10, 5, 1];
    const previewEnabled = this.store.get('previewNotificationsEnabled') !== false;
    const previewSeconds = 30; // Preview 30 seconds before full-screen
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

        // Schedule preview notification if enabled
        if (previewEnabled && this.onPreviewNotification) {
          const previewTime = new Date(reminderTime.getTime() - previewSeconds * 1000);
          
          if (previewTime > now) {
            const previewId = `preview-${event.id}-${minutesBefore}`;
            
            const previewJob = schedule.scheduleJob(previewTime, () => {
              console.log(`Preview notification: ${event.title} (${minutesBefore} min before)`);
              this.onPreviewNotification({
                ...event,
                reminderMinutes: minutesBefore
              });
            });
            
            if (previewJob) {
              this.previewJobs.set(previewId, previewJob);
              console.log(`Scheduled preview: ${event.title} at ${previewTime.toLocaleString()}`);
            }
          }
        }

        // Schedule main reminder
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
        } else {
          console.error(`Failed to schedule reminder for ${event.title} at ${reminderTime.toLocaleString()}`);
        }
      }
    }

    console.log(`Scheduled ${this.scheduledJobs.size} reminders and ${this.previewJobs.size} previews`);
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
   * Snooze a meeting reminder
   * @param {Object} event - Event to snooze
   * @param {number} minutes - Minutes to snooze (default: 5)
   */
  snooze(event, minutes = 5) {
    if (!event || !event.id) {
      console.error('Cannot snooze: invalid event');
      return false;
    }

    const snoozeId = `snooze-${event.id}`;
    
    // Cancel any existing snooze for this event
    const existingJob = this.snoozedJobs.get(snoozeId);
    if (existingJob) {
      existingJob.cancel();
      this.snoozedJobs.delete(snoozeId);
    }

    // Schedule a new reminder
    const snoozeTime = new Date(Date.now() + minutes * 60 * 1000);
    const job = schedule.scheduleJob(snoozeTime, () => {
      console.log(`Snooze expired for: ${event.title}`);
      this.snoozedJobs.delete(snoozeId);
      this.onReminder({
        ...event,
        reminderMinutes: 0,
        snoozed: true
      });
    });

    if (job) {
      this.snoozedJobs.set(snoozeId, job);
      console.log(`Snoozed: ${event.title} for ${minutes} minutes until ${snoozeTime.toLocaleString()}`);
      return true;
    } else {
      console.error(`Failed to schedule snooze for ${event.title}`);
      return false;
    }
  }

  /**
   * Cancel all scheduled jobs
   */
  cancelAll() {
    for (const job of this.scheduledJobs.values()) {
      job.cancel();
    }
    this.scheduledJobs.clear();
    
    for (const job of this.previewJobs.values()) {
      job.cancel();
    }
    this.previewJobs.clear();
    
    for (const job of this.snoozedJobs.values()) {
      job.cancel();
    }
    this.snoozedJobs.clear();
  }
}

module.exports = { Scheduler };
