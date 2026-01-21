// DOM Elements
const googleBtn = document.getElementById('google-btn');
const googleStatus = document.getElementById('google-status');
const syncBtn = document.getElementById('sync-btn');
const upcomingEvents = document.getElementById('upcoming-events');
const remind10 = document.getElementById('remind-10');
const remind5 = document.getElementById('remind-5');
const remind1 = document.getElementById('remind-1');
const soundEnabled = document.getElementById('sound-enabled');
const syncInterval = document.getElementById('sync-interval');
const oauthClientId = document.getElementById('google-client-id');
const oauthClientSecret = document.getElementById('google-client-secret');
const oauthSaveBtn = document.getElementById('oauth-save-btn');
const oauthStatus = document.getElementById('oauth-status');

// Current settings
let settings = {};

/**
 * Load settings from main process
 */
async function loadSettings() {
  settings = await window.electronAPI.getSettings();
  
  // Update UI with settings
  updateConnectionStatus();
  updateReminderCheckboxes();
  soundEnabled.checked = settings.soundEnabled !== false;
  if (syncInterval) {
    syncInterval.value = String(settings.syncInterval || 5);
  }

  await loadOAuthConfig();
  
  // Load upcoming events
  await loadUpcomingEvents();
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
    soundEnabled: soundEnabled.checked
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
      await loadUpcomingEvents();
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
  syncBtn.textContent = 'Sync Now';
  syncBtn.disabled = false;
});

// Save settings on change
remind10.addEventListener('change', saveSettings);
remind5.addEventListener('change', saveSettings);
remind1.addEventListener('change', saveSettings);
soundEnabled.addEventListener('change', saveSettings);
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

// Initialize
loadSettings();
