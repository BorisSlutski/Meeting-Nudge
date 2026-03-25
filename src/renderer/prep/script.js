// Apply theme from command-line args (same pattern as settings/blocking windows)
const args = process.argv || [];
const themeArg = args.find(a => a.startsWith('--theme='));
if (themeArg) {
  document.documentElement.setAttribute('data-theme', themeArg.split('=')[1]);
}

const timeBadge = document.getElementById('time-badge');
const meetingTitle = document.getElementById('meeting-title');
const meetingTime = document.getElementById('meeting-time');
const meetingLocation = document.getElementById('meeting-location');
const joinButtons = document.getElementById('join-buttons');
const dismissBtn = document.getElementById('dismiss-btn');
const gotItBtn = document.getElementById('got-it-btn');
const progressFill = document.getElementById('progress-fill');

const AUTO_DISMISS_MS = 30000; // 30 seconds
let dismissTimer = null;
let progressTimer = null;

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatMinutesUntil(isoString) {
  const diff = Math.round((new Date(isoString) - Date.now()) / 60000);
  if (diff <= 0) return 'now';
  if (diff === 1) return '1 minute';
  return `${diff} minutes`;
}

function close() {
  clearTimeout(dismissTimer);
  clearInterval(progressTimer);
  window.electronAPI.closePrepWindow();
}

function showEvent(event) {
  // Title
  meetingTitle.textContent = event.title || 'Meeting';
  meetingTitle.title = event.title || '';

  // Badge
  const minsUntil = formatMinutesUntil(event.start);
  timeBadge.textContent = `Meeting in ${minsUntil}`;

  // Time
  const start = formatTime(event.start);
  const end = event.end ? ` – ${formatTime(event.end)}` : '';
  meetingTime.textContent = `🕐 ${start}${end}`;

  // Location
  if (event.location) {
    meetingLocation.textContent = `📍 ${event.location}`;
    meetingLocation.style.display = '';
  } else {
    meetingLocation.style.display = 'none';
  }

  // Join buttons
  joinButtons.innerHTML = '';
  const links = event.conferenceLinks && event.conferenceLinks.length > 0
    ? event.conferenceLinks
    : (event.conferenceLink ? [{ url: event.conferenceLink, name: event.conferenceName || 'Join', icon: event.conferenceIcon || '🔗' }] : []);

  links.slice(0, 2).forEach(link => {
    const btn = document.createElement('button');
    btn.className = 'btn-join';
    btn.textContent = `${link.icon || ''} ${link.name || 'Join'}`.trim();
    btn.addEventListener('click', () => {
      window.electronAPI.joinMeetingFromPrep(link.url);
    });
    joinButtons.appendChild(btn);
  });

  // Auto-dismiss countdown using progress bar
  let elapsed = 0;
  const totalMs = AUTO_DISMISS_MS;
  progressFill.style.width = '100%';

  progressTimer = setInterval(() => {
    elapsed += 1000;
    const pct = Math.max(0, 100 - (elapsed / totalMs) * 100);
    progressFill.style.width = pct + '%';
    if (elapsed >= totalMs) {
      clearInterval(progressTimer);
    }
  }, 1000);

  dismissTimer = setTimeout(close, AUTO_DISMISS_MS);
}

// Listen for event data from main process
window.electronAPI.onShowPrepEvent((event) => {
  showEvent(event);
});

// Dismiss buttons
dismissBtn.addEventListener('click', close);
gotItBtn.addEventListener('click', close);
