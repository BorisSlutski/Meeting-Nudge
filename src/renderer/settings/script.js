// DOM Elements
const googleBtn = document.getElementById('google-btn');
const googleStatus = document.getElementById('google-status');
const syncBtn = document.getElementById('sync-btn');
const upcomingEvents = document.getElementById('upcoming-events');
const remind10 = document.getElementById('remind-10');
const remind5 = document.getElementById('remind-5');
const remind1 = document.getElementById('remind-1');
const soundEnabled = document.getElementById('sound-enabled');
const soundFile = document.getElementById('sound-file');
const soundVolume = document.getElementById('sound-volume');
const volumeValue = document.getElementById('volume-value');
const previewNotificationsEnabled = document.getElementById('preview-notifications-enabled');
const syncInterval = document.getElementById('sync-interval');
const oauthClientId = document.getElementById('google-client-id');
const oauthClientSecret = document.getElementById('google-client-secret');
const oauthSaveBtn = document.getElementById('oauth-save-btn');
const oauthStatus = document.getElementById('oauth-status');
const pauseStatusCard = document.getElementById('pause-status-card');
const pauseStatusText = document.getElementById('pause-status-text');
const resumeBtn = document.getElementById('resume-btn');
const syncStatus = document.getElementById('sync-status');

// Theme elements
const themeOptions = document.querySelectorAll('.theme-option');

// Calendar elements
const refreshCalendarsBtn = document.getElementById('refresh-calendars-btn');
const createCalendarBtn = document.getElementById('create-calendar-btn');
const createCalendarForm = document.getElementById('create-calendar-form');
const saveNewCalendarBtn = document.getElementById('save-new-calendar-btn');
const cancelCreateCalendarBtn = document.getElementById('cancel-create-calendar-btn');
const newCalendarName = document.getElementById('new-calendar-name');
const newCalendarDescription = document.getElementById('new-calendar-description');
const newCalendarLocation = document.getElementById('new-calendar-location');
const calendarsList = document.getElementById('calendars-list');
const calendarStatus = document.getElementById('calendar-status');

// Current settings
let settings = {};
let pauseUpdateInterval = null;
let syncStatusInterval = null;

/**
 * Update sync status display
 */
async function updateSyncStatus() {
  if (!syncStatus) return;
  
  try {
    const status = await window.electronAPI.getSyncStatus();
    
    if (!status.lastSyncTime) {
      syncStatus.textContent = 'Not synced yet';
      syncStatus.style.color = '#888';
      return;
    }
    
    const lastSync = new Date(status.lastSyncTime);
    const minutesAgo = Math.floor((new Date() - lastSync) / (1000 * 60));
    
    let timeText;
    if (minutesAgo === 0) {
      timeText = 'just now';
    } else if (minutesAgo === 1) {
      timeText = '1 minute ago';
    } else if (minutesAgo < 60) {
      timeText = `${minutesAgo} minutes ago`;
    } else {
      const hoursAgo = Math.floor(minutesAgo / 60);
      timeText = hoursAgo === 1 ? '1 hour ago' : `${hoursAgo} hours ago`;
    }
    
    if (status.lastSyncSuccess) {
      syncStatus.textContent = `✓ Last synced ${timeText}`;
      syncStatus.style.color = '#4caf50';
    } else {
      syncStatus.textContent = `⚠ Sync failed ${timeText}: ${status.lastError || 'Unknown error'}`;
      syncStatus.style.color = '#ff5722';
    }
  } catch (error) {
    console.error('Failed to get sync status:', error);
  }
}

/**
 * Load settings from main process
 */
async function loadSettings() {
  settings = await window.electronAPI.getSettings();
  
  // Update UI with settings
  updateConnectionStatus();
  updateReminderCheckboxes();
  updatePauseStatus();
  updateSyncStatus();
  soundEnabled.checked = settings.soundEnabled !== false;
  if (soundFile) {
    soundFile.value = settings.soundFile || 'default.mp3';
  }
  if (soundVolume && volumeValue) {
    soundVolume.value = settings.soundVolume || 70;
    volumeValue.textContent = soundVolume.value;
  }
  if (previewNotificationsEnabled) {
    previewNotificationsEnabled.checked = settings.previewNotificationsEnabled !== false;
  }
  if (syncInterval) {
    syncInterval.value = String(settings.syncInterval || 5);
  }

  await loadOAuthConfig();
  
  // Load upcoming events
  await loadUpcomingEvents();

  // Load theme
  await loadTheme();

  // Update pause status every minute
  if (pauseUpdateInterval) {
    clearInterval(pauseUpdateInterval);
  }
  pauseUpdateInterval = setInterval(() => {
    updatePauseStatus();
  }, 60 * 1000);

  // Update sync status every 30 seconds
  if (syncStatusInterval) {
    clearInterval(syncStatusInterval);
  }
  syncStatusInterval = setInterval(() => {
    updateSyncStatus();
  }, 30 * 1000);

  // Load log path
  loadLogPath();
}

/**
 * Load and display log file path
 */
async function loadLogPath() {
  if (!logPathText) return;
  
  try {
    const logPath = await window.electronAPI.getLogPath();
    logPathText.textContent = `Log location: ${logPath}`;
  } catch (error) {
    console.error('Failed to get log path:', error);
  }
}

/**
 * Update pause status display
 */
function updatePauseStatus() {
  const pausedUntil = settings.pausedUntil;
  
  if (!pausedUntil || new Date(pausedUntil) <= new Date()) {
    // Not paused or pause expired
    pauseStatusCard.style.display = 'none';
    return;
  }

  // Show pause banner
  pauseStatusCard.style.display = 'block';
  
  const until = new Date(pausedUntil);
  const now = new Date();
  const minutesLeft = Math.ceil((until - now) / (1000 * 60));
  
  let statusText;
  if (minutesLeft < 60) {
    statusText = `Resuming in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`;
  } else {
    const hoursLeft = Math.floor(minutesLeft / 60);
    const remainingMinutes = minutesLeft % 60;
    if (remainingMinutes === 0) {
      statusText = `Resuming in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`;
    } else {
      statusText = `Resuming in ${hoursLeft}h ${remainingMinutes}m`;
    }
  }
  
  pauseStatusText.textContent = statusText;
}

/**
 * Update connection status display
 */
function updateConnectionStatus() {
  if (settings.googleConnected) {
    googleStatus.textContent = 'Connected';
    googleStatus.classList.add('connected');
    googleBtn.textContent = 'Disconnect';
    googleBtn.classList.add('connected');
  } else {
    googleStatus.textContent = 'Not connected';
    googleStatus.classList.remove('connected');
    googleBtn.textContent = 'Connect';
    googleBtn.classList.remove('connected');
  }

}

/**
 * Update reminder checkboxes based on settings
 */
function updateReminderCheckboxes() {
  const times = settings.reminderTimes || [10, 5, 1];
  remind10.checked = times.includes(10);
  remind5.checked = times.includes(5);
  remind1.checked = times.includes(1);
}

/**
 * Get selected reminder times
 */
function getSelectedReminderTimes() {
  const times = [];
  if (remind10.checked) times.push(10);
  if (remind5.checked) times.push(5);
  if (remind1.checked) times.push(1);
  return times.sort((a, b) => b - a);
}

/**
 * Save settings to main process
 */
async function saveSettings() {
  const newSettings = {
    reminderTimes: getSelectedReminderTimes(),
    syncInterval: parseInt(syncInterval?.value, 10) || 5,
    soundEnabled: soundEnabled.checked,
    soundFile: soundFile?.value || 'default.mp3',
    soundVolume: parseInt(soundVolume?.value, 10) || 70,
    previewNotificationsEnabled: previewNotificationsEnabled?.checked !== false
  };
  
  await window.electronAPI.saveSettings(newSettings);
  settings = { ...settings, ...newSettings };
}

/**
 * Load upcoming events
 */
async function loadUpcomingEvents() {
  const events = await window.electronAPI.getUpcomingEvents();
  
  if (events.length === 0) {
    upcomingEvents.textContent = '';
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No upcoming meetings';
    upcomingEvents.appendChild(emptyState);
    return;
  }

  upcomingEvents.textContent = '';
  events.forEach((event) => {
    upcomingEvents.appendChild(createEventItem(event));
  });
}

function createEventItem(event) {
  const startDate = new Date(event.start);
  const time = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = formatDate(startDate);
  const sourceClass = normalizeCssToken(event.source);

  const item = document.createElement('div');
  item.className = 'event-item';

  const timeContainer = document.createElement('div');
  timeContainer.className = 'event-time';

  const timeEl = document.createElement('div');
  timeEl.className = 'time';
  timeEl.textContent = time;

  const dateEl = document.createElement('div');
  dateEl.className = 'date';
  dateEl.textContent = date;

  timeContainer.appendChild(timeEl);
  timeContainer.appendChild(dateEl);

  const details = document.createElement('div');
  details.className = 'event-details';

  const title = document.createElement('div');
  title.className = 'event-title';
  title.textContent = event.title || 'Untitled Event';
  details.appendChild(title);

  if (event.location) {
    const location = document.createElement('div');
    location.className = 'event-location';
    location.textContent = event.location;
    details.appendChild(location);
  }

  if (event.conferenceLink) {
    const conference = document.createElement('div');
    conference.className = 'event-location';
    const icon = event.conferenceIcon || 'Video';
    const name = event.conferenceName || 'Video Call';
    conference.textContent = `${icon} ${name}`;
    details.appendChild(conference);
  }

  const source = document.createElement('span');
  source.className = `event-source ${sourceClass}`;
  source.textContent = event.source || 'unknown';

  item.appendChild(timeContainer);
  item.appendChild(details);
  item.appendChild(source);

  return item;
}

function normalizeCssToken(value) {
  if (!value) return 'unknown';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}

/**
 * Load OAuth client credentials
 */
async function loadOAuthConfig() {
  if (!oauthClientId || !oauthClientSecret) return;
  const config = await window.electronAPI.getOAuthConfig();
  oauthClientId.value = config.clientId || '';
  oauthClientSecret.value = config.clientSecret || '';
  
  const oauthSection = document.getElementById('oauth-section');
  const credentialsBadge = document.getElementById('credentials-badge');
  
  if (config.clientId && config.clientSecret) {
    setOAuthStatus('Saved');
    // Hide section if credentials exist
    if (oauthSection) {
      oauthSection.classList.add('collapsed');
    }
    if (credentialsBadge) {
      credentialsBadge.textContent = '✓ Configured';
      credentialsBadge.style.color = '#4caf50';
    }
  } else {
    // Show section if no credentials
    if (oauthSection) {
      oauthSection.classList.remove('collapsed');
    }
    if (credentialsBadge) {
      credentialsBadge.textContent = '⚠ Not configured';
      credentialsBadge.style.color = '#ff9800';
    }
  }
}

/**
 * Save OAuth client credentials
 */
async function saveOAuthConfig() {
  if (!oauthClientId || !oauthClientSecret || !oauthSaveBtn) return;
  oauthSaveBtn.disabled = true;
  oauthSaveBtn.textContent = 'Saving...';
  setOAuthStatus('');
  const result = await window.electronAPI.saveOAuthConfig({
    clientId: oauthClientId.value.trim(),
    clientSecret: oauthClientSecret.value.trim()
  });
  
  const oauthSection = document.getElementById('oauth-section');
  const credentialsBadge = document.getElementById('credentials-badge');
  
  if (result.success) {
    setOAuthStatus('Saved! Section will auto-collapse in 2 seconds...');
    // Auto-collapse after save
    setTimeout(() => {
      if (oauthSection) {
        oauthSection.classList.add('collapsed');
      }
      if (credentialsBadge) {
        credentialsBadge.textContent = '✓ Configured';
        credentialsBadge.style.color = '#4caf50';
      }
      setOAuthStatus('');
    }, 2000);
  } else {
    setOAuthStatus(result.error || 'Save failed');
  }
  oauthSaveBtn.textContent = 'Save Credentials';
  oauthSaveBtn.disabled = false;
}

function setOAuthStatus(message) {
  if (oauthStatus) {
    oauthStatus.textContent = message;
  }
}

/**
 * Format date for display
 */
function formatDate(date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  } else {
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

// Event Listeners
googleBtn.addEventListener('click', async () => {
  if (settings.googleConnected) {
    googleBtn.disabled = true;
    googleBtn.textContent = 'Disconnecting...';
    const result = await window.electronAPI.disconnectGoogle();
    if (result.success) {
      settings.googleConnected = false;
      updateConnectionStatus();
      await loadUpcomingEvents();
    }
    googleBtn.disabled = false;
  } else {
    googleBtn.disabled = true;
    googleBtn.textContent = 'Connecting...';
    const result = await window.electronAPI.connectGoogle();
    if (result.success) {
      settings.googleConnected = true;
      updateConnectionStatus();
      await loadCalendars(); // Load calendars after successful connection
      await loadUpcomingEvents();
      // Auto-expand calendar section to show the newly loaded calendars
      if (calendarSection) {
        calendarSection.classList.remove('collapsed');
      }
    } else {
      alert('Failed to connect: ' + (result.error || 'Unknown error'));
    }
    googleBtn.disabled = false;
    updateConnectionStatus();
  }
});

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing...';
  await window.electronAPI.syncCalendars();
  await loadUpcomingEvents();
  await updateSyncStatus();
  syncBtn.textContent = 'Sync Now';
  syncBtn.disabled = false;
});

// Save settings on change
remind10.addEventListener('change', saveSettings);
remind5.addEventListener('change', saveSettings);
remind1.addEventListener('change', saveSettings);
soundEnabled.addEventListener('change', saveSettings);
if (soundFile) {
  soundFile.addEventListener('change', saveSettings);
}
if (soundVolume && volumeValue) {
  soundVolume.addEventListener('input', () => {
    volumeValue.textContent = soundVolume.value;
  });
  soundVolume.addEventListener('change', saveSettings);
}
if (previewNotificationsEnabled) {
  previewNotificationsEnabled.addEventListener('change', saveSettings);
}
if (syncInterval) {
  syncInterval.addEventListener('change', saveSettings);
}

// Setup instructions toggle
const setupHeader = document.getElementById('setup-header');
const setupSection = document.getElementById('setup-section');
if (setupHeader && setupSection) {
  setupHeader.addEventListener('click', () => {
    setupSection.classList.toggle('collapsed');
  });
}

// OAuth credentials toggle
const oauthHeader = document.getElementById('oauth-header');
const oauthSection = document.getElementById('oauth-section');
if (oauthHeader && oauthSection) {
  oauthHeader.addEventListener('click', () => {
    oauthSection.classList.toggle('collapsed');
  });
}

// Test mode toggle
const testHeader = document.getElementById('test-header');
const testSection = document.getElementById('test-section');
if (testHeader && testSection) {
  testHeader.addEventListener('click', () => {
    testSection.classList.toggle('collapsed');
  });
}

// External links
document.querySelectorAll('.external-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const url = link.getAttribute('data-url');
    if (url) {
      window.electronAPI.openExternal(url);
    }
  });
});

if (oauthSaveBtn) {
  oauthSaveBtn.addEventListener('click', saveOAuthConfig);
}

// Resume button
if (resumeBtn) {
  resumeBtn.addEventListener('click', async () => {
    resumeBtn.disabled = true;
    resumeBtn.textContent = 'Resuming...';
    await window.electronAPI.saveSettings({ pausedUntil: null });
    settings.pausedUntil = null;
    updatePauseStatus();
    resumeBtn.disabled = false;
    resumeBtn.textContent = 'Resume Now';
  });
}

// Test Mode: Generate test events
const generateTestBtn = document.getElementById('generate-test-btn');
const testReminderBtn = document.getElementById('test-reminder-btn');
const testStatus = document.getElementById('test-status');
const openLogBtn = document.getElementById('open-log-btn');
const logPathText = document.getElementById('log-path-text');

if (generateTestBtn) {
  generateTestBtn.addEventListener('click', async () => {
    generateTestBtn.disabled = true;
    generateTestBtn.textContent = 'Generating...';
    testStatus.textContent = '';
    
    const result = await window.electronAPI.generateTestEvents();
    
    if (result.success) {
      testStatus.textContent = `✓ Generated ${result.count} test events`;
      testStatus.style.color = '#4caf50';
      await loadUpcomingEvents();
      
      setTimeout(() => {
        testStatus.textContent = '';
      }, 3000);
    } else {
      testStatus.textContent = '✗ Failed to generate test events';
      testStatus.style.color = '#f44336';
    }
    
    generateTestBtn.disabled = false;
    generateTestBtn.textContent = 'Generate Test Events';
  });
}

if (testReminderBtn) {
  testReminderBtn.addEventListener('click', async () => {
    testReminderBtn.disabled = true;
    testReminderBtn.textContent = 'Triggering...';
    testStatus.textContent = '';
    
    const result = await window.electronAPI.testReminderNow();
    
    if (result.success) {
      testStatus.textContent = '✓ Test reminder triggered!';
      testStatus.style.color = '#4caf50';
      
      setTimeout(() => {
        testStatus.textContent = '';
      }, 3000);
    } else {
      testStatus.textContent = '✗ Failed to trigger reminder';
      testStatus.style.color = '#f44336';
    }
    
    testReminderBtn.disabled = false;
    testReminderBtn.textContent = 'Test Reminder Now';
  });
}

// Open log file
if (openLogBtn) {
  openLogBtn.addEventListener('click', async () => {
    openLogBtn.disabled = true;
    openLogBtn.textContent = 'Opening...';
    
    const result = await window.electronAPI.openLogFile();
    
    if (result.success) {
      logPathText.textContent = `✓ Opened: ${result.path}`;
      logPathText.style.color = '#4caf50';
      
      setTimeout(() => {
        loadLogPath();
      }, 3000);
    } else {
      logPathText.textContent = '✗ Failed to open log file';
      logPathText.style.color = '#f44336';
    }
    
    openLogBtn.disabled = false;
    openLogBtn.textContent = 'Open Log File';
  });
}


// Theme management
async function loadTheme() {
  if (!themeOptions.length) return;

  try {
    const themeData = await window.electronAPI.getTheme();
    const preference = themeData.preference;
    const resolved = themeData.resolved;

    // Update UI selection
    themeOptions.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === preference);
    });

    // Apply theme to settings window
    document.documentElement.setAttribute('data-theme', resolved);
  } catch (error) {
    console.error('Failed to load theme:', error);
  }
}

// Theme switcher event listeners
themeOptions.forEach(btn => {
  btn.addEventListener('click', async () => {
    const theme = btn.dataset.theme;

    // Update selection
    themeOptions.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Save theme
    try {
      const result = await window.electronAPI.setTheme(theme);

      // Apply to settings window
      document.documentElement.setAttribute('data-theme', result.theme);
    } catch (error) {
      console.error('Failed to set theme:', error);
    }
  });
});

// Apply theme from command line arguments
const args = process.argv;
const themeArg = args.find(arg => arg.startsWith('--theme='));
if (themeArg) {
  const theme = themeArg.split('=')[1];
  document.documentElement.setAttribute('data-theme', theme);
}

// Calendar management
function updateCalendarBadge(count) {
  const calendarHeader = document.querySelector('#calendar-section .collapsible-header h2');
  if (!calendarHeader) return;

  // Remove existing badge
  const existingBadge = calendarHeader.querySelector('.calendar-count-badge');
  if (existingBadge) {
    existingBadge.remove();
  }

  // Add new badge if we have calendars
  if (count > 0) {
    const badge = document.createElement('span');
    badge.className = 'calendar-count-badge';
    badge.textContent = count;
    badge.title = `${count} calendar${count !== 1 ? 's' : ''} available`;
    calendarHeader.appendChild(badge);
  }
}

async function loadCalendars() {
  if (!calendarsList) return;

  try {
    calendarStatus.textContent = 'Loading calendars...';
    const result = await window.electronAPI.listGoogleCalendars();

    if (!result.success) {
      calendarStatus.textContent = `Error: ${result.error}`;
      calendarStatus.style.color = '#f44336';
      calendarsList.innerHTML = '<p style="color: var(--text-secondary);">Unable to load calendars. Please check your connection.</p>';
      return;
    }

    if (result.calendars.length === 0) {
      calendarsList.innerHTML = '<p style="color: var(--text-secondary);">No calendars found.</p>';
      calendarStatus.textContent = '';
      return;
    }

    // Render calendars
    calendarsList.innerHTML = result.calendars.map(cal => `
      <label class="calendar-item">
        <input type="checkbox"
               class="calendar-checkbox"
               data-calendar-id="${cal.id}"
               ${cal.selected ? 'checked' : ''}>
        <div class="calendar-info">
          <div class="calendar-color" style="background-color: ${cal.backgroundColor};"></div>
          <div class="calendar-details">
            <div class="calendar-name">${cal.summary}</div>
            <div class="calendar-access">${cal.accessRole}${cal.primary ? '<span class="primary-badge">Primary</span>' : ''}</div>
          </div>
        </div>
      </label>
    `).join('');

    // Add change listeners
    document.querySelectorAll('.calendar-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', saveSelectedCalendars);
    });

    // Update calendar count badge and auto-expand if we have calendars
    updateCalendarBadge(result.calendars.length);
    if (result.calendars.length > 0 && calendarSection) {
      calendarSection.classList.remove('collapsed');
    }

    calendarStatus.textContent = `Loaded ${result.calendars.length} calendars`;
    calendarStatus.style.color = '#4caf50';

    setTimeout(() => {
      calendarStatus.textContent = '';
    }, 3000);

  } catch (error) {
    console.error('Failed to load calendars:', error);
    calendarStatus.textContent = 'Failed to load calendars';
    calendarStatus.style.color = '#f44336';
  }
}

async function saveSelectedCalendars() {
  try {
    const selectedIds = Array.from(document.querySelectorAll('.calendar-checkbox:checked'))
      .map(cb => cb.dataset.calendarId);

    calendarStatus.textContent = 'Saving...';

    const result = await window.electronAPI.saveSelectedCalendars(selectedIds);

    if (result.success) {
      calendarStatus.textContent = `✓ Saved ${selectedIds.length} calendar(s)`;
      calendarStatus.style.color = '#4caf50';

      // Refresh events display
      await loadUpcomingEvents();
    } else {
      calendarStatus.textContent = `Error: ${result.error}`;
      calendarStatus.style.color = '#f44336';
    }

    setTimeout(() => {
      calendarStatus.textContent = '';
    }, 3000);

  } catch (error) {
    console.error('Failed to save calendars:', error);
    calendarStatus.textContent = 'Failed to save selection';
    calendarStatus.style.color = '#f44336';
  }
}

// Calendar event listeners
if (refreshCalendarsBtn) {
  refreshCalendarsBtn.addEventListener('click', loadCalendars);
}

if (createCalendarBtn) {
  createCalendarBtn.addEventListener('click', () => {
    createCalendarForm.style.display = createCalendarForm.style.display === 'none' ? 'block' : 'none';
    if (createCalendarForm.style.display === 'block') {
      newCalendarName.focus();
    }
  });
}

if (cancelCreateCalendarBtn) {
  cancelCreateCalendarBtn.addEventListener('click', () => {
    createCalendarForm.style.display = 'none';
    clearCreateCalendarForm();
  });
}

if (saveNewCalendarBtn) {
  saveNewCalendarBtn.addEventListener('click', createNewCalendar);
}

function clearCreateCalendarForm() {
  newCalendarName.value = '';
  newCalendarDescription.value = '';
  newCalendarLocation.value = '';
}

async function createNewCalendar() {
  const name = newCalendarName.value.trim();
  const description = newCalendarDescription.value.trim();
  const location = newCalendarLocation.value.trim();

  if (!name) {
    alert('Calendar name is required');
    newCalendarName.focus();
    return;
  }

  saveNewCalendarBtn.disabled = true;
  saveNewCalendarBtn.textContent = 'Creating...';

  try {
    const calendarData = { summary: name };
    if (description) calendarData.description = description;
    if (location) calendarData.location = location;

    const result = await window.electronAPI.createGoogleCalendar(calendarData);

    if (result.success) {
      calendarStatus.textContent = `✓ Created calendar "${name}"`;
      calendarStatus.style.color = '#4caf50';

      // Hide form and clear it
      createCalendarForm.style.display = 'none';
      clearCreateCalendarForm();

      // Refresh calendar list to show the new calendar
      await loadCalendars();
      await loadUpcomingEvents();
    } else {
      calendarStatus.textContent = `Error: ${result.error}`;
      calendarStatus.style.color = '#f44336';
    }
  } catch (error) {
    console.error('Failed to create calendar:', error);
    calendarStatus.textContent = 'Failed to create calendar';
    calendarStatus.style.color = '#f44336';
  }

  saveNewCalendarBtn.disabled = false;
  saveNewCalendarBtn.textContent = 'Create Calendar';

  setTimeout(() => {
    calendarStatus.textContent = '';
  }, 5000);
}

// Load calendars on settings load (if Google is connected)
async function loadSettingsWithCalendars() {
  await loadSettings();

  // Load calendars if Google is connected
  const googleConnected = settings.googleConnected;
  if (googleConnected) {
    await loadCalendars();
  } else {
    calendarsList.innerHTML = '<p style="color: var(--text-secondary);">Please connect your Google Calendar first.</p>';
    // Clear any existing badge
    updateCalendarBadge(0);
  }
}

// Calendar section toggle
const calendarSection = document.getElementById('calendar-section');
const calendarHeader = document.querySelector('#calendar-section .collapsible-header');

if (calendarHeader && calendarSection) {
  calendarHeader.addEventListener('click', () => {
    calendarSection.classList.toggle('collapsed');

    // Load calendars when section is opened and Google is connected
    if (!calendarSection.classList.contains('collapsed') && settings.googleConnected) {
      loadCalendars();
    }
  });
}

// Initialize
loadSettings();
