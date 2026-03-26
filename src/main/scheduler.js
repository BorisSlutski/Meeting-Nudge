const schedule = require('node-schedule');

/**
 * Scheduler for meeting reminders
 */
class Scheduler {
  constructor(store, onReminder, onPreviewNotification, onPrepWindow) {
    this.store = store;
    this.onReminder = onReminder;
    this.onPreviewNotification = onPreviewNotification; // Optional preview callback
    this.onPrepWindow = onPrepWindow; // Optional prep window callback
    this.scheduledJobs = new Map();
    this.previewJobs = new Map(); // Track preview notification jobs
    this.prepJobs = new Map(); // Track prep window jobs
    this.snoozedJobs = new Map(); // Track snoozed reminders: eventId → { job, event }
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
    console.log('=== RESCHEDULE ALL - Starting ===');
    console.log(`Current jobs: ${this.scheduledJobs.size} reminders, ${this.previewJobs.size} previews, ${this.snoozedJobs.size} snoozed`);
    
    // First, clean up any stale job references
    this.cleanupStaleJobs();
    console.log(`After cleanup: ${this.scheduledJobs.size} reminders, ${this.previewJobs.size} previews, ${this.snoozedJobs.size} snoozed`);
    
    // Cancel all existing jobs with better error handling
    // Process scheduledJobs
    const scheduledJobIds = Array.from(this.scheduledJobs.keys());
    for (const jobId of scheduledJobIds) {
      const job = this.scheduledJobs.get(jobId);
      if (job) {
        try {
          job.cancel();
          console.log(`✓ Canceled scheduled job: ${jobId}`);
        } catch (error) {
          console.error(`✗ Error canceling job ${jobId}:`, error);
        }
      }
      this.scheduledJobs.delete(jobId);
    }
    
    // Process previewJobs
    const previewJobIds = Array.from(this.previewJobs.keys());
    for (const jobId of previewJobIds) {
      const job = this.previewJobs.get(jobId);
      if (job) {
        try {
          job.cancel();
          console.log(`✓ Canceled preview job: ${jobId}`);
        } catch (error) {
          console.error(`✗ Error canceling preview job ${jobId}:`, error);
        }
      }
      this.previewJobs.delete(jobId);
    }

    // Process prepJobs
    const prepJobIds = Array.from(this.prepJobs.keys());
    for (const jobId of prepJobIds) {
      const job = this.prepJobs.get(jobId);
      if (job) {
        try {
          job.cancel();
          console.log(`✓ Canceled prep job: ${jobId}`);
        } catch (error) {
          console.error(`✗ Error canceling prep job ${jobId}:`, error);
        }
      }
      this.prepJobs.delete(jobId);
    }

    // Process snoozedJobs
    const snoozedJobIds = Array.from(this.snoozedJobs.keys());
    for (const jobId of snoozedJobIds) {
      const job = this.snoozedJobs.get(jobId);
      if (job) {
        try {
          job.cancel();
          console.log(`✓ Canceled snoozed job: ${jobId}`);
        } catch (error) {
          console.error(`✗ Error canceling snoozed job ${jobId}:`, error);
        }
      }
      this.snoozedJobs.delete(jobId);
    }
    
    if (snoozedJobIds.length > 0) {
      console.log(`Cleared ${snoozedJobIds.length} snoozed reminder(s) during sync`);
    }

    const reminderTimes = this.store.get('reminderTimes') || [10, 5, 1];
    const previewEnabled = this.store.get('previewNotificationsEnabled') !== false;
    const previewSeconds = 30; // Preview 30 seconds before full-screen
    const now = new Date();
    console.log(`Rescheduling for ${this.events.length} events at ${now.toISOString()}`);

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
            
            // Check if this job ID already exists (shouldn't happen, but safety check)
            if (this.previewJobs.has(previewId)) {
              console.warn(`⚠ Preview job ${previewId} already exists! Canceling old one.`);
              const oldJob = this.previewJobs.get(previewId);
              oldJob.cancel();
              this.previewJobs.delete(previewId);
            }
            
            const previewJob = schedule.scheduleJob(previewTime, () => {
              console.log(`Preview notification: ${event.title} (${minutesBefore} min before)`);
              // Remove from tracking after execution
              this.previewJobs.delete(previewId);
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

        // Schedule prep window if enabled
        const prepEnabled = this.store.get('prepWindowEnabled') !== false;
        if (prepEnabled && this.onPrepWindow) {
          const prepLeadMinutes = this.store.get('prepWindowLeadMinutes') || 2;
          const prepTime = new Date(reminderTime.getTime() - prepLeadMinutes * 60 * 1000);

          if (prepTime > now) {
            const prepJobId = `prep-${event.id}-${minutesBefore}`;
            if (this.prepJobs.has(prepJobId)) {
              this.prepJobs.get(prepJobId).cancel();
              this.prepJobs.delete(prepJobId);
            }
            const prepJob = schedule.scheduleJob(prepTime, () => {
              console.log(`⏱ Prep window: ${event.title} (${minutesBefore} min reminder)`);
              this.prepJobs.delete(prepJobId);
              this.onPrepWindow({ ...event, reminderMinutes: minutesBefore });
            });
            if (prepJob) {
              this.prepJobs.set(prepJobId, prepJob);
              console.log(`Scheduled prep window: ${event.title} at ${prepTime.toLocaleString()}`);
            }
          }
        }

        // Schedule main reminder
        const jobId = `${event.id}-${minutesBefore}`;
        
        // Check if this job ID already exists (shouldn't happen, but safety check)
        if (this.scheduledJobs.has(jobId)) {
          console.warn(`⚠ Job ${jobId} already exists! Canceling old one.`);
          const oldJob = this.scheduledJobs.get(jobId);
          oldJob.cancel();
          this.scheduledJobs.delete(jobId);
        }
        
        const job = schedule.scheduleJob(reminderTime, () => {
          console.log(`🔔 TRIGGERING reminder for: ${event.title} (${minutesBefore} min before) [Job ID: ${jobId}]`);
          console.log(`   Event start: ${eventStart.toLocaleString()}, Current time: ${new Date().toLocaleString()}`);
          // Remove from tracking after execution
          this.scheduledJobs.delete(jobId);
          this.onReminder({
            ...event,
            reminderMinutes: minutesBefore
          });
        });

        if (job) {
          this.scheduledJobs.set(jobId, job);
          console.log(`✓ Scheduled reminder: ${event.title} at ${reminderTime.toLocaleString()} (${minutesBefore} min before) [Job ID: ${jobId}]`);
        } else {
          console.error(`✗ Failed to schedule reminder for ${event.title} at ${reminderTime.toLocaleString()}`);
        }
      }
    }

    console.log(`=== RESCHEDULE ALL - Complete ===`);
    console.log(`✓ Scheduled ${this.scheduledJobs.size} reminders and ${this.previewJobs.size} previews for ${this.events.length} events`);
    
    // Log details of scheduled jobs for debugging
    if (this.scheduledJobs.size > 0) {
      console.log('Scheduled reminder jobs:');
      for (const [jobId, job] of this.scheduledJobs.entries()) {
        const nextInvocation = job.nextInvocation();
        console.log(`  - ${jobId}: ${nextInvocation ? nextInvocation.toString() : 'no next invocation'}`);
      }
    }
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
    const existingEntry = this.snoozedJobs.get(snoozeId);
    if (existingEntry) {
      console.log(`Canceling existing snooze for: ${event.title}`);
      existingEntry.job.cancel();
      this.snoozedJobs.delete(snoozeId);
    }

    // Schedule a new reminder
    const snoozeTime = new Date(Date.now() + minutes * 60 * 1000);
    const job = schedule.scheduleJob(snoozeTime, () => {
      console.log(`🔔 Snooze expired for: ${event.title} [Snooze ID: ${snoozeId}]`);
      this.snoozedJobs.delete(snoozeId);
      this.onReminder({
        ...event,
        reminderMinutes: 0,
        snoozed: true
      });
    });

    if (job) {
      this.snoozedJobs.set(snoozeId, { job, event });
      console.log(`✓ Snoozed: ${event.title} for ${minutes} minutes until ${snoozeTime.toLocaleString()} [Snooze ID: ${snoozeId}]`);
      return true;
    } else {
      console.error(`✗ Failed to schedule snooze for ${event.title}`);
      return false;
    }
  }

  /**
   * Cancel an active snooze for an event
   * @param {string} eventId
   * @returns {boolean}
   */
  cancelSnooze(eventId) {
    const snoozeId = `snooze-${eventId}`;
    const entry = this.snoozedJobs.get(snoozeId);
    if (entry) {
      entry.job.cancel();
      this.snoozedJobs.delete(snoozeId);
      console.log(`✓ Cancelled snooze for event: ${eventId}`);
      return true;
    }
    return false;
  }

  /**
   * Get all currently snoozed events
   * @returns {Array} Array of event objects that are currently snoozed
   */
  getSnoozedEvents() {
    return Array.from(this.snoozedJobs.values()).map(entry => entry.event);
  }

  /**
   * Clean up any stale job references (jobs that have already executed)
   */
  cleanupStaleJobs() {
    // Clean up scheduled jobs
    for (const [jobId, job] of this.scheduledJobs.entries()) {
      const nextInvocation = job.nextInvocation();
      if (!nextInvocation) {
        console.log(`Cleaning up stale scheduled job: ${jobId}`);
        this.scheduledJobs.delete(jobId);
      }
    }
    
    // Clean up preview jobs
    for (const [jobId, job] of this.previewJobs.entries()) {
      const nextInvocation = job.nextInvocation();
      if (!nextInvocation) {
        console.log(`Cleaning up stale preview job: ${jobId}`);
        this.previewJobs.delete(jobId);
      }
    }

    // Clean up prep jobs
    for (const [jobId, job] of this.prepJobs.entries()) {
      const nextInvocation = job.nextInvocation();
      if (!nextInvocation) {
        console.log(`Cleaning up stale prep job: ${jobId}`);
        this.prepJobs.delete(jobId);
      }
    }

    // Clean up snoozed jobs
    for (const [jobId, entry] of this.snoozedJobs.entries()) {
      const nextInvocation = entry.job.nextInvocation();
      if (!nextInvocation) {
        console.log(`Cleaning up stale snoozed job: ${jobId}`);
        this.snoozedJobs.delete(jobId);
      }
    }
  }

  /**
   * Cancel all scheduled jobs
   */
  cancelAll() {
    console.log('Canceling all jobs...');
    for (const job of this.scheduledJobs.values()) {
      job.cancel();
    }
    this.scheduledJobs.clear();
    
    for (const job of this.previewJobs.values()) {
      job.cancel();
    }
    this.previewJobs.clear();

    for (const job of this.prepJobs.values()) {
      job.cancel();
    }
    this.prepJobs.clear();

    for (const entry of this.snoozedJobs.values()) {
      entry.job.cancel();
    }
    this.snoozedJobs.clear();
    console.log('All jobs canceled');
  }
}

module.exports = { Scheduler };
