// Apply theme from command line arguments
const args = process.argv;
const themeArg = args.find(arg => arg.startsWith('--theme='));
if (themeArg) {
  const theme = themeArg.split('=')[1];
  document.documentElement.setAttribute('data-theme', theme);
}

// Current event data
let currentEvent = null;
let countdownInterval = null;
let lastSnoozeMinutes = 5; // Default snooze duration

// DOM elements - will be initialized after DOM loads
let meetingTitle, reminderPrefix, minutesLeft, reminderSuffix, meetingTime, timeText,
    meetingLocation, locationText, joinBtn, joinIcon, acknowledgeBtn, snoozeBtn,
    snoozeText, snoozeMenuBtn, snoozeOptions, countdownTimer, alertSound, container;

// Initialize DOM elements
function initializeDOMElements() {
  meetingTitle = document.getElementById('meeting-title');
  reminderPrefix = document.getElementById('reminder-prefix');
  minutesLeft = document.getElementById('minutes-left');
  reminderSuffix = document.getElementById('reminder-suffix');
  meetingTime = document.getElementById('meeting-time');
  timeText = document.getElementById('time-text');
  meetingLocation = document.getElementById('meeting-location');
  locationText = document.getElementById('location-text');
  joinBtn = document.getElementById('join-btn');
  joinIcon = document.getElementById('join-icon');
  acknowledgeBtn = document.getElementById('acknowledge-btn');
  snoozeBtn = document.getElementById('snooze-btn');
  snoozeText = document.getElementById('snooze-text');
  snoozeMenuBtn = document.getElementById('snooze-menu-btn');
  snoozeOptions = document.getElementById('snooze-options');
  countdownTimer = document.getElementById('countdown-timer');
  alertSound = document.getElementById('alert-sound');
  container = document.querySelector('.container');

  // Attach event listeners now that elements exist
  attachEventListeners();
}

// Attach event listeners to buttons
function attachEventListeners() {
  if (joinBtn) {
    joinBtn.addEventListener('click', () => {
      if (currentEvent?.conferenceLink) {
        stopSound();
        clearInterval(countdownInterval);
        window.electronAPI.joinMeeting(currentEvent.conferenceLink);
      }
    });
  }

  if (acknowledgeBtn) {
    acknowledgeBtn.addEventListener('click', () => {
      stopSound();
      clearInterval(countdownInterval);
      window.electronAPI.acknowledgeMeeting();
    });
  }

  if (snoozeBtn) {
    snoozeBtn.addEventListener('click', () => {
      stopSound();
      clearInterval(countdownInterval);
      window.electronAPI.snoozeMeeting({
        minutes: lastSnoozeMinutes,
        event: currentEvent
      });
    });
  }

  // Toggle snooze options menu
  if (snoozeMenuBtn) {
    snoozeMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      snoozeOptions.classList.toggle('show');
    });
  }

  // Handle snooze option selection
  document.querySelectorAll('.snooze-option').forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const minutes = parseInt(option.getAttribute('data-minutes'), 10);
      lastSnoozeMinutes = minutes;

      // Update button text
      snoozeText.textContent = `Snooze ${minutes} min`;

      // Hide menu
      snoozeOptions.classList.remove('show');

      // Execute snooze
      stopSound();
      clearInterval(countdownInterval);
      window.electronAPI.snoozeMeeting({
        minutes: minutes,
        event: currentEvent
      });
    });
  });

  // Close menu when clicking outside
  document.addEventListener('click', () => {
    if (snoozeOptions) {
      snoozeOptions.classList.remove('show');
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDOMElements);
} else {
  initializeDOMElements();
}

/**
 * Format time for display
 */
function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Update countdown timer
 */
function updateCountdown() {
  if (!currentEvent) return;

  const now = new Date();
  const start = new Date(currentEvent.start);
  const diff = start - now;

  if (diff <= 0) {
    countdownTimer.textContent = 'NOW!';
    container.classList.add('urgent');
    reminderPrefix.textContent = 'Starting';
    minutesLeft.textContent = 'NOW!';
    reminderSuffix.textContent = '';
    return;
  }

  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  countdownTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Update urgency
  container.classList.toggle('urgent', minutes < 2);

  // Update badge
  reminderPrefix.textContent = 'Starting in';
  minutesLeft.textContent = minutes;
  reminderSuffix.textContent = minutes === 1 ? 'minute' : 'minutes';
}

/**
 * Display event on screen
 */
function showEvent(event) {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  currentEvent = event;
  
  // Set title
  meetingTitle.textContent = event.title;
  
  // Set time
  const startTime = formatTime(event.start);
  const endTime = formatTime(event.end);
  timeText.textContent = `${startTime} - ${endTime}`;
  
  // Set reminder badge
  if (event.reminderMinutes) {
    minutesLeft.textContent = event.reminderMinutes;
    reminderPrefix.textContent = 'Starting in';
    reminderSuffix.textContent = event.reminderMinutes === 1 ? 'minute' : 'minutes';
  }
  
  // Set location if exists
  if (event.location) {
    meetingLocation.style.display = 'flex';
    locationText.textContent = event.location;
  } else {
    meetingLocation.style.display = 'none';
  }
  
  // Set join button if conference link exists
  if (event.conferenceLink) {
    joinBtn.style.display = 'flex';
    joinIcon.textContent = event.conferenceIcon || '📹';
    
    // Update button text based on conference type
    const joinText = event.conferenceName ? `Join ${event.conferenceName}` : 'Join Meeting';
    joinBtn.querySelector('span:last-child').textContent = joinText;
  } else {
    joinBtn.style.display = 'none';
  }

  // Update snooze button text with last selected duration
  snoozeText.textContent = `Snooze ${lastSnoozeMinutes} min`;
  
  // Start countdown
  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
  
  // Play alert sound
  playSound();
  
  // Focus container for keyboard trap
  container.focus();
}

/**
 * Play alert sound
 */
function playSound() {
  try {
    if (currentEvent?.soundEnabled === false) {
      return;
    }
    alertSound.volume = 0.7;
    alertSound.play().catch(err => {
      console.log('Could not play sound:', err);
    });
  } catch (e) {
    console.log('Sound error:', e);
  }
}

/**
 * Stop alert sound
 */
function stopSound() {
  try {
    alertSound.pause();
    alertSound.currentTime = 0;
  } catch (e) {
    console.log('Sound stop error:', e);
  }
}

// Event handlers are now properly attached in the attachEventListeners() function

// Listen for events from main process
window.electronAPI.onShowEvent((event) => {
  showEvent(event);
});

window.electronAPI.onUpdateEvent((event) => {
  // Clear existing countdown
  clearInterval(countdownInterval);
  showEvent(event);
});

// Prevent keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Block Escape
  if (e.key === 'Escape') {
    e.preventDefault();
    return false;
  }
  
  // Block Alt+F4
  if (e.altKey && e.key === 'F4') {
    e.preventDefault();
    return false;
  }
  
  // Block Cmd+W / Ctrl+W
  if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
    e.preventDefault();
    return false;
  }
  
  // Block Cmd+Q / Alt+F4
  if ((e.metaKey && e.key === 'q') || (e.altKey && e.key === 'F4')) {
    e.preventDefault();
    return false;
  }
});

// Prevent right-click context menu
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  return false;
});

// Focus trap - keep focus in the window
document.addEventListener('focusout', () => {
  setTimeout(() => {
    if (document.activeElement === document.body) {
      acknowledgeBtn.focus();
    }
  }, 0);
});
