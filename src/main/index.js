const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { TrayManager } = require('./tray');
const { Scheduler } = require('./scheduler');
const { GoogleCalendar } = require('./calendar/google');
const { SecureStore } = require('./store');

// Initialize store for settings
const store = new Store({
  defaults: {
    reminderTimes: [10, 5, 1], // minutes before meeting
    syncInterval: 5, // minutes
    soundEnabled: true,
    soundFile: 'alert.mp3',
    googleConnected: false,
    pausedUntil: null
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

const MEETING_HOST_ALLOWLIST = [
  'zoom.us',
  'meet.google.com',
  'teams.microsoft.com',
  'webex.com',
  'gotomeeting.com',
  'gotomeet.com',
  'bluejeans.com',
  'slack.com',
  'discord.gg',
  'discord.com',
  'whereby.com',
  'around.co',
  'meet.jit.si',
  'chime.aws',
  'ringcentral.com'
];

const EXTERNAL_HOST_ALLOWLIST = [
  'console.cloud.google.com',
  'cloud.google.com',
  'developers.google.com',
  'accounts.google.com'
];

function isAllowedHost(hostname, allowlist) {
  const host = String(hostname || '').toLowerCase();
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function isSafeExternalUrl(url, allowlist) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (!['https:'].includes(parsed.protocol)) {
      return false;
    }
    if (Array.isArray(allowlist) && allowlist.length > 0) {
      return isAllowedHost(parsed.hostname, allowlist);
    }
    return true;
  } catch (error) {
    return false;
  }
}

function sanitizeSettings(settings) {
  const sanitized = {};

  if (Array.isArray(settings?.reminderTimes)) {
    const times = settings.reminderTimes
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value) && value > 0 && value <= 120);
    if (times.length > 0) {
      sanitized.reminderTimes = [...new Set(times)].sort((a, b) => b - a);
    }
  }

  if (settings?.syncInterval !== undefined) {
    const interval = Number.parseInt(settings.syncInterval, 10);
    if (Number.isFinite(interval) && interval > 0 && interval <= 60) {
      sanitized.syncInterval = interval;
    }
  }

  if (typeof settings?.soundEnabled === 'boolean') {
    sanitized.soundEnabled = settings.soundEnabled;
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

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 700,
    resizable: false,
    title: 'Meeting Nudge - Settings',
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
 * Sync all calendars
 */
async function syncCalendars() {
  console.log('Syncing calendars...');
  allEvents = [];

  try {
    // Sync Google Calendar
    if (store.get('googleConnected') && googleCalendar) {
      try {
        const googleEvents = await googleCalendar.getUpcomingEvents();
        allEvents = allEvents.concat(googleEvents);
      } catch (error) {
        console.log('Google Calendar sync skipped:', error.message);
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

    console.log(`Synced ${allEvents.length} events`);
  } catch (error) {
    console.error('Error syncing calendars:', error);
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

  // Initialize scheduler
  scheduler = new Scheduler(store, (event) => {
    // Check if reminders are paused
    const pausedUntil = store.get('pausedUntil');
    if (pausedUntil && new Date(pausedUntil) > new Date()) {
      console.log('Reminders paused, skipping alert');
      return;
    }
    createBlockingWindow(event);
  });

  // Initialize tray
  trayManager = new TrayManager(
    () => createSettingsWindow(),
    () => syncCalendars(),
    (minutes) => {
      const pauseUntil = new Date(Date.now() + minutes * 60 * 1000);
      store.set('pausedUntil', pauseUntil.toISOString());
    },
    () => app.quit()
  );

  // Initial sync
  await syncCalendars();

  // Schedule periodic sync
  scheduleSyncTimer();
}

// App ready
app.whenReady().then(async () => {
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
    return { success: false, error: error.message };
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

ipcMain.handle('acknowledge-meeting', () => {
  closeBlockingWindow();
  return { success: true };
});

ipcMain.handle('snooze-meeting', (event, minutes = 5) => {
  closeBlockingWindow();
  // The scheduler will handle the next reminder
  return { success: true };
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
