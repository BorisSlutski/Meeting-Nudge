const { Tray, Menu, nativeImage, app, shell } = require('electron');
const path = require('path');

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

function isAllowedHost(hostname, allowlist) {
  const host = String(hostname || '').toLowerCase();
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * System tray manager
 */
class TrayManager {
  constructor(onSettings, onSync, onPause, onQuit) {
    this.tray = null;
    this.onSettings = onSettings;
    this.onSync = onSync;
    this.onPause = onPause;
    this.onQuit = onQuit;
    this.upcomingEvents = [];
    
    this.createTray();
  }

  /**
   * Create the system tray icon
   */
  createTray() {
    // Load the tray icon
    const iconPath = path.join(__dirname, '..', '..', 'resources', 'tray-icon.png');
    
    // Try to load icon, fall back to default
    let icon;
    try {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        // Create a simple colored icon as fallback
        icon = this.createDefaultIcon();
      }
    } catch (e) {
      icon = this.createDefaultIcon();
    }

    // Resize for tray (16x16 on macOS, 32x32 on Windows/Linux)
    if (process.platform === 'darwin') {
      icon = icon.resize({ width: 16, height: 16 });
    } else {
      icon = icon.resize({ width: 32, height: 32 });
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('Meeting Nudge');
    
    this.updateMenu();

    // Left click shows upcoming events on macOS
    this.tray.on('click', () => {
      this.onSettings();
    });
  }

  /**
   * Create a default icon
   */
  createDefaultIcon() {
    // Create a simple 16x16 icon with a bell emoji representation
    // This is a basic fallback - in production you'd use a proper icon file
    const size = 32;
    const canvas = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="#4a90d9"/>
        <text x="${size/2}" y="${size/2 + 4}" text-anchor="middle" fill="white" font-size="14">🔔</text>
      </svg>
    `;
    return nativeImage.createFromBuffer(Buffer.from(canvas));
  }

  /**
   * Update the tray menu
   */
  updateMenu() {
    const menuItems = [];

    // Upcoming events section
    if (this.upcomingEvents.length > 0) {
      menuItems.push({ label: 'Upcoming Meetings', enabled: false });
      menuItems.push({ type: 'separator' });
      
      for (const event of this.upcomingEvents.slice(0, 5)) {
        const startTime = new Date(event.start);
        const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = this.formatDate(startTime);
        
        menuItems.push({
          label: `${timeStr} - ${event.title}`,
          sublabel: dateStr,
          click: () => {
            if (event.conferenceLink) {
              if (this.isSafeMeetingUrl(event.conferenceLink)) {
                shell.openExternal(event.conferenceLink);
              }
            }
          }
        });
      }
      menuItems.push({ type: 'separator' });
    } else {
      menuItems.push({ label: 'No upcoming meetings', enabled: false });
      menuItems.push({ type: 'separator' });
    }

    // Actions
    menuItems.push({
      label: 'Sync Now',
      click: () => this.onSync()
    });

    menuItems.push({ type: 'separator' });

    // Pause submenu
    menuItems.push({
      label: 'Pause Reminders',
      submenu: [
        { label: '30 minutes', click: () => this.onPause(30) },
        { label: '1 hour', click: () => this.onPause(60) },
        { label: '2 hours', click: () => this.onPause(120) },
        { label: 'Until tomorrow', click: () => this.onPause(this.minutesUntilTomorrow()) }
      ]
    });

    menuItems.push({
      label: 'Settings',
      click: () => this.onSettings()
    });

    menuItems.push({ type: 'separator' });

    menuItems.push({
      label: 'Quit',
      click: () => this.onQuit()
    });

    const contextMenu = Menu.buildFromTemplate(menuItems);
    this.tray.setContextMenu(contextMenu);
  }

  isSafeMeetingUrl(url) {
    if (typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && isAllowedHost(parsed.hostname, MEETING_HOST_ALLOWLIST);
    } catch (error) {
      return false;
    }
  }

  /**
   * Update upcoming events
   * @param {Array} events - Array of upcoming events
   */
  updateEvents(events) {
    this.upcomingEvents = events;
    this.updateMenu();
  }

  /**
   * Format date for display
   * @param {Date} date 
   * @returns {string}
   */
  formatDate(date) {
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

  /**
   * Calculate minutes until tomorrow
   * @returns {number}
   */
  minutesUntilTomorrow() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return Math.ceil((tomorrow - now) / (1000 * 60));
  }

  /**
   * Destroy the tray
   */
  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = { TrayManager };
