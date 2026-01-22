const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { TrayManager } = require('./tray');
const { Scheduler } = require('./scheduler');
const { GoogleCalendar } = require('./calendar/google');
const { SecureStore } = require('./store');
const { isSafeExternalUrl, MEETING_HOST_ALLOWLIST, EXTERNAL_HOST_ALLOWLIST } = require('./utils/url-validator');
const { createLogger, getLogPath } = require('./utils/logger');

// Create logger for this module
const logger = createLogger('main');

// Set app name immediately (before app is ready)
app.setName('Meeting Nudge');

// Initialize store for settings
const store = new Store({
  defaults: {
    reminderTimes: [10, 5, 1], // minutes before meeting
    syncInterval: 5, // minutes
    soundEnabled: true,
    soundFile: 'alert.mp3',
    googleConnected: false,
    pausedUntil: null,
    previewNotificationsEnabled: true
  }
});

// Global references
let mainWindow = null;
let blockingWindow = null;
let settingsWindow = null;
let trayManager = null;
let scheduler = null;
let googleCalendar = null;
let syncTimer = null;
let isQuitting = false;

// All calendar events
let allEvents = [];

// Sync state tracking
let syncState = {
  lastSyncTime: null,
  lastSyncSuccess: true,
  syncAttempts: 0,
  maxRetries: 3,
  retryDelay: 5000, // 5 seconds base delay
  lastError: null
};

function getSyncIntervalMinutes() {
  const value = parseInt(store.get('syncInterval'), 10);
  return Number.isFinite(value) && value > 0 ? value : 5;
}

function buildReminderPayload(event) {
  return {
    ...event,
    soundEnabled: store.get('soundEnabled') !== false
  };
}

function sanitizeSettings(settings) {
  const sanitized = {};

  // Validate reminder times
  if (Array.isArray(settings?.reminderTimes)) {
    const times = settings.reminderTimes
      .map((value) => {
        const num = Number.parseInt(value, 10);
        // Reject NaN, negative, zero, Infinity, and too-large values
        return (!isNaN(num) && isFinite(num) && num > 0 && num <= 120) ? num : null;
      })
      .filter((value) => value !== null);
    
    if (times.length > 0) {
      // Remove duplicates and sort descending
      sanitized.reminderTimes = [...new Set(times)].sort((a, b) => b - a);
    }
  }

  // Validate sync interval
  if (settings?.syncInterval !== undefined) {
    const interval = Number.parseInt(settings.syncInterval, 10);
    // Must be positive, finite, reasonable range
    if (!isNaN(interval) && isFinite(interval) && interval > 0 && interval <= 60) {
      sanitized.syncInterval = interval;
    }
  }

  // Validate sound enabled (must be boolean)
  if (typeof settings?.soundEnabled === 'boolean') {
    sanitized.soundEnabled = settings.soundEnabled;
  }

  // Validate preview notifications enabled (must be boolean)
  if (typeof settings?.previewNotificationsEnabled === 'boolean') {
    sanitized.previewNotificationsEnabled = settings.previewNotificationsEnabled;
  }

  // Validate pausedUntil (must be valid ISO date string or null)
  if (settings?.pausedUntil === null) {
    sanitized.pausedUntil = null;
  } else if (typeof settings?.pausedUntil === 'string') {
    const date = new Date(settings.pausedUntil);
    if (!isNaN(date.getTime())) {
      sanitized.pausedUntil = settings.pausedUntil;
    }
  }

  return sanitized;
}

/**
 * Create the main settings window
 */
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  const iconPath = path.join(__dirname, '..', '..', 'resources', 'icon.png');

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 700,
    resizable: false,
    title: 'Meeting Nudge - Settings',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings', 'index.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

/**
 * Create the full-screen blocking window
 */
function createBlockingWindow(event) {
  // If already showing a blocking window, update it
  if (blockingWindow && !blockingWindow.isDestroyed()) {
    blockingWindow.webContents.send('update-event', buildReminderPayload(event));
    return;
  }

  const iconPath = path.join(__dirname, '..', '..', 'resources', 'icon.png');

  blockingWindow = new BrowserWindow({
    fullscreen: true,
    alwaysOnTop: true,
    closable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a2e',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Prevent keyboard shortcuts from closing the window
  blockingWindow.setMenu(null);
  
  // Keep window on top even when losing focus
  blockingWindow.setAlwaysOnTop(true, 'screen-saver');
  
  // Prevent Alt+F4 on Windows
  blockingWindow.on('close', (e) => {
    if (isQuitting) {
      return;
    }
    e.preventDefault();
  });

  blockingWindow.loadFile(path.join(__dirname, '..', 'renderer', 'blocking', 'index.html'));

  blockingWindow.webContents.on('did-finish-load', () => {
    blockingWindow.webContents.send('show-event', buildReminderPayload(event));
  });

  // Block escape key
  blockingWindow.webContents.on('before-input-event', (e, input) => {
    if (input.key === 'Escape' || (input.alt && input.key === 'F4')) {
      e.preventDefault();
    }
  });
}

/**
 * Close the blocking window
 */
function closeBlockingWindow() {
  if (blockingWindow && !blockingWindow.isDestroyed()) {
    // Use destroy() instead of close() because the window was created with closable: false
    // and has a close event preventing normal closure
    blockingWindow.destroy();
    blockingWindow = null;
  }
}

/**
 * Sync all calendars with retry logic
 * @param {number} attemptNumber - Current attempt number (for retry tracking)
 */
async function syncCalendars(attemptNumber = 0) {
  logger.info(`Syncing calendars... (attempt ${attemptNumber + 1}/${syncState.maxRetries})`);
  
  try {
    allEvents = [];

    // Sync Google Calendar
    if (store.get('googleConnected') && googleCalendar) {
      try {
        const googleEvents = await googleCalendar.getUpcomingEvents();
        allEvents = allEvents.concat(googleEvents);
        logger.debug(`Fetched ${googleEvents.length} events from Google Calendar`);
      } catch (error) {
        logger.error('Google Calendar sync error:', error.message);
        
        // If it's an auth error, don't retry
        if (error.message.includes('expired') || error.message.includes('authentication')) {
          throw error; // Propagate auth errors immediately
        }
        
        // For other errors, we'll retry
        throw new Error(`Calendar sync failed: ${error.message}`);
      }
    }

    // Sort by start time
    allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

    // Update scheduler with new events
    if (scheduler) {
      scheduler.updateEvents(allEvents);
    }

    // Update tray with upcoming events
    if (trayManager) {
      trayManager.updateEvents(allEvents.slice(0, 5));
    }

    // Update sync state on success
    syncState.lastSyncTime = new Date();
    syncState.lastSyncSuccess = true;
    syncState.syncAttempts = 0;
    syncState.lastError = null;

    logger.info(`✓ Synced ${allEvents.length} events successfully`);
    
  } catch (error) {
    logger.error('Error syncing calendars:', error);
    
    // Update sync state on failure
    syncState.lastSyncSuccess = false;
    syncState.lastError = error.message;
    syncState.syncAttempts = attemptNumber + 1;
    
    // Check if we should retry
    const isAuthError = error.message.includes('expired') || error.message.includes('authentication');
    
    if (!isAuthError && attemptNumber < syncState.maxRetries - 1) {
      // Calculate exponential backoff delay
      const delay = syncState.retryDelay * Math.pow(2, attemptNumber);
      logger.warn(`⚠ Sync failed, retrying in ${delay / 1000} seconds...`);
      
      // Schedule retry
      setTimeout(() => {
        syncCalendars(attemptNumber + 1);
      }, delay);
    } else {
      // Max retries reached or auth error - notify user
      logger.error(`✗ Sync failed after ${attemptNumber + 1} attempts: ${error.message}`);
      
      // Update tray to show error
      if (trayManager) {
        trayManager.updateSyncError(error.message);
      }
      
      // Show notification to user
      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        new Notification({
          title: 'Calendar Sync Failed',
          body: isAuthError 
            ? 'Please reconnect your calendar in Settings'
            : `Sync failed after ${attemptNumber + 1} attempts. Will retry on next schedule.`,
          urgency: 'normal'
        }).show();
      }
    }
  }
}

function scheduleSyncTimer() {
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  const syncIntervalMinutes = getSyncIntervalMinutes();
  syncTimer = setInterval(syncCalendars, syncIntervalMinutes * 60 * 1000);
}

/**
 * Initialize the app
 */
async function initialize() {
  // Initialize calendar integrations
  googleCalendar = new GoogleCalendar(store);

  // Initialize scheduler with preview notification handler
  scheduler = new Scheduler(
    store,
    // Main reminder callback
    (event) => {
      // Check if reminders are paused
      const pausedUntil = store.get('pausedUntil');
      if (pausedUntil && new Date(pausedUntil) > new Date()) {
        logger.info('Reminders paused, skipping alert');
        return;
      }
      createBlockingWindow(event);
    },
    // Preview notification callback
    (event) => {
      // Check if reminders are paused
      const pausedUntil = store.get('pausedUntil');
      if (pausedUntil && new Date(pausedUntil) > new Date()) {
        return;
      }
      
      // Show native notification preview
      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: `Meeting in ${event.reminderMinutes} minute${event.reminderMinutes !== 1 ? 's' : ''}`,
          body: event.title,
          icon: path.join(__dirname, '..', '..', 'resources', 'icon.png'),
          urgency: 'normal',
          timeoutType: 'default'
        });
        
        // Click notification to show full-screen immediately
        notification.on('click', () => {
          createBlockingWindow(event);
        });
        
        notification.show();
        logger.debug(`Preview notification shown for: ${event.title}`);
      }
    }
  );

  // Initialize tray
  trayManager = new TrayManager(
    () => createSettingsWindow(),
    () => syncCalendars(),
    (minutes) => {
      const pauseUntil = new Date(Date.now() + minutes * 60 * 1000);
      store.set('pausedUntil', pauseUntil.toISOString());
      // Update tray menu to show pause status
      if (trayManager) {
        trayManager.updateMenu();
      }
    },
    () => app.quit(),
    store
  );

  // Update tray menu every minute to refresh pause countdown
  setInterval(() => {
    if (trayManager) {
      trayManager.updateMenu();
    }
  }, 60 * 1000);

  // Initial sync
  await syncCalendars();

  // Schedule periodic sync
  scheduleSyncTimer();
}

// App ready
app.whenReady().then(async () => {
  // Set app icon for dock/taskbar (works in development mode too)
  const iconPath = path.join(__dirname, '..', '..', 'resources', 'icon.png');
  const appIcon = nativeImage.createFromPath(iconPath);
  
  // Set dock icon on macOS
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(appIcon);
  }
  
  await initialize();

  // macOS: re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSettingsWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  closeBlockingWindow();
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  // Don't quit - we run in the tray
});

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    createSettingsWindow();
  });
}

// IPC Handlers
ipcMain.handle('get-settings', () => {
  return store.store;
});

ipcMain.handle('save-settings', (event, settings) => {
  const sanitized = sanitizeSettings(settings);
  Object.entries(sanitized).forEach(([key, value]) => {
    store.set(key, value);
  });
  if (sanitized.syncInterval) {
    scheduleSyncTimer();
  }
  if (sanitized.reminderTimes && scheduler) {
    scheduler.updateEvents(allEvents);
  }
  return true;
});

ipcMain.handle('get-upcoming-events', () => {
  return allEvents.slice(0, 10);
});

ipcMain.handle('connect-google', async () => {
  try {
    await googleCalendar.authenticate();
    store.set('googleConnected', true);
    await syncCalendars();
    return { success: true };
  } catch (error) {
    console.error('Google auth error:', error);
    
    // Provide user-friendly error messages
    let userMessage = error.message;
    if (error.message.includes('credentials not configured')) {
      userMessage = 'Please configure your Google OAuth credentials in Settings first.';
    } else if (error.message.includes('No available ports')) {
      userMessage = 'Unable to start authentication server. Please close other applications and try again.';
    } else if (error.message.includes('OAuth window closed')) {
      userMessage = 'Authentication cancelled. Please try again when ready.';
    } else if (error.message.includes('Invalid OAuth state')) {
      userMessage = 'Authentication failed due to security error. Please try again.';
    }
    
    return { success: false, error: userMessage };
  }
});

ipcMain.handle('disconnect-google', async () => {
  await googleCalendar.disconnect();
  store.set('googleConnected', false);
  await syncCalendars();
  return { success: true };
});

ipcMain.handle('get-oauth-config', async () => {
  const clientId = await SecureStore.getToken('google-client-id');
  const clientSecret = await SecureStore.getToken('google-client-secret');
  return {
    clientId: clientId || '',
    clientSecret: clientSecret || ''
  };
});

ipcMain.handle('save-oauth-config', async (event, config) => {
  try {
    const clientId = typeof config?.clientId === 'string' ? config.clientId.trim() : '';
    const clientSecret = typeof config?.clientSecret === 'string' ? config.clientSecret.trim() : '';

    if (clientId) {
      await SecureStore.setToken('google-client-id', clientId);
    } else {
      await SecureStore.deleteToken('google-client-id');
    }

    if (clientSecret) {
      await SecureStore.setToken('google-client-secret', clientSecret);
    } else {
      await SecureStore.deleteToken('google-client-secret');
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sync-calendars', async () => {
  await syncCalendars();
  return { success: true };
});

ipcMain.handle('get-sync-status', () => {
  return {
    lastSyncTime: syncState.lastSyncTime,
    lastSyncSuccess: syncState.lastSyncSuccess,
    syncAttempts: syncState.syncAttempts,
    lastError: syncState.lastError
  };
});

ipcMain.handle('acknowledge-meeting', () => {
  closeBlockingWindow();
  return { success: true };
});

ipcMain.handle('snooze-meeting', (event, data) => {
  const minutes = data?.minutes || 5;
  const meetingEvent = data?.event;
  
  closeBlockingWindow();
  
  // Schedule snooze reminder if we have event data
  if (scheduler && meetingEvent) {
    const success = scheduler.snooze(meetingEvent, minutes);
    return { success, snoozedFor: minutes };
  }
  
  return { success: false, error: 'No event data provided' };
});

ipcMain.handle('join-meeting', (event, url) => {
  if (!isSafeExternalUrl(url, MEETING_HOST_ALLOWLIST)) {
    return { success: false, error: 'Invalid URL' };
  }
  shell.openExternal(url);
  closeBlockingWindow();
  return { success: true };
});

ipcMain.handle('open-external', (event, url) => {
  if (!isSafeExternalUrl(url, EXTERNAL_HOST_ALLOWLIST)) {
    return { success: false, error: 'Invalid URL' };
  }
  shell.openExternal(url);
  return { success: true };
});

// Test Mode: Generate fake events for testing
ipcMain.handle('generate-test-events', () => {
  const now = new Date();
  const testEvents = [
    {
      id: 'test-1',
      title: 'Test Meeting - Starting Soon',
      start: new Date(now.getTime() + 2 * 60 * 1000).toISOString(), // 2 minutes from now
      end: new Date(now.getTime() + 32 * 60 * 1000).toISOString(),
      location: 'Test Room',
      description: 'This is a test meeting',
      source: 'test',
      conferenceLink: 'https://zoom.us/j/123456789',
      conferenceName: 'Zoom',
      conferenceIcon: '📹'
    },
    {
      id: 'test-2',
      title: 'Test Meeting - 15 Minutes',
      start: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      end: new Date(now.getTime() + 45 * 60 * 1000).toISOString(),
      location: 'Conference Room B',
      description: 'Another test meeting',
      source: 'test',
      conferenceLink: 'https://meet.google.com/abc-defg-hij',
      conferenceName: 'Google Meet',
      conferenceIcon: '🟢'
    },
    {
      id: 'test-3',
      title: 'Test Meeting - 1 Hour',
      start: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      end: new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
      location: 'Virtual',
      description: 'Test meeting in 1 hour',
      source: 'test',
      conferenceLink: 'https://teams.microsoft.com/l/meetup-join/test',
      conferenceName: 'Microsoft Teams',
      conferenceIcon: '🟣'
    }
  ];
  
  allEvents = testEvents;
  
  // Update scheduler
  if (scheduler) {
    scheduler.updateEvents(allEvents);
  }
  
  // Update tray
  if (trayManager) {
    trayManager.updateEvents(allEvents.slice(0, 5));
  }
  
  console.log('Generated test events:', testEvents.length);
  return { success: true, count: testEvents.length };
});

// Test Mode: Trigger immediate reminder
ipcMain.handle('test-reminder-now', () => {
  const now = new Date();
  const testEvent = {
    id: 'test-immediate',
    title: 'Test Reminder - NOW',
    start: new Date(now.getTime() + 1 * 60 * 1000).toISOString(), // 1 minute from now
    end: new Date(now.getTime() + 31 * 60 * 1000).toISOString(),
    location: 'Test Location',
    description: 'Immediate test reminder',
    source: 'test',
    conferenceLink: 'https://zoom.us/j/test123',
    conferenceName: 'Zoom',
    conferenceIcon: '📹',
    reminderMinutes: 1
  };
  
  // Trigger blocking window immediately
  createBlockingWindow(testEvent);
  
  return { success: true };
});

// Logging utilities
ipcMain.handle('get-log-path', () => {
  return getLogPath();
});

ipcMain.handle('open-log-file', () => {
  const logPath = getLogPath();
  shell.showItemInFolder(logPath);
  return { success: true, path: logPath };
});
