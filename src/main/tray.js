const { Tray, Menu, nativeImage, app, shell } = require('electron');
const path = require('path');
const { isSafeExternalUrl, MEETING_HOST_ALLOWLIST } = require('./utils/url-validator');

/**
 * System tray manager
 */
class TrayManager {
  constructor(onSettings, onSync, onPause, onQuit, store) {
    this.tray = null;
    this.onSettings = onSettings;
    this.onSync = onSync;
    this.onPause = onPause;
    this.onQuit = onQuit;
    this.store = store;
    this.upcomingEvents = [];
    this.syncError = null;
    this.lastSyncTime = null;
    
    this.createTray();
  }

  /**
   * Create the system tray icon
   */
  createTray() {
    // Use optimized tray icon based on platform
    let iconPath;
    if (process.platform === 'darwin') {
      // macOS: 16x16 or 32x32 (supports retina)
      iconPath = path.join(__dirname, '..', '..', 'resources', 'tray-icon-16.png');
    } else if (process.platform === 'win32') {
      // Windows: 16x16 or 32x32
      iconPath = path.join(__dirname, '..', '..', 'resources', 'tray-icon-32.png');
    } else {
      // Linux: typically 16x16 or 22x22
      iconPath = path.join(__dirname, '..', '..', 'resources', 'tray-icon-16.png');
    }
    
    // Try to load icon, fall back to default
    let icon;
    try {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        // Fallback to main tray icon
        icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'resources', 'tray-icon.png'));
        // Resize if needed
        if (process.platform === 'darwin') {
          icon = icon.resize({ width: 16, height: 16 });
        } else if (process.platform === 'win32') {
          icon = icon.resize({ width: 32, height: 32 });
        } else {
          icon = icon.resize({ width: 16, height: 16 });
        }
      }
    } catch (e) {
      icon = this.createDefaultIcon();
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
   * Check if reminders are currently paused
   * @returns {boolean}
   */
  isPaused() {
    if (!this.store) return false;
    const pausedUntil = this.store.get('pausedUntil');
    return pausedUntil && new Date(pausedUntil) > new Date();
  }

  /**
   * Get pause status text
   * @returns {string|null}
   */
  getPauseStatus() {
    if (!this.isPaused()) return null;
    const pausedUntil = new Date(this.store.get('pausedUntil'));
    const now = new Date();
    const minutesLeft = Math.ceil((pausedUntil - now) / (1000 * 60));
    
    if (minutesLeft < 60) {
      return `Paused for ${minutesLeft} min`;
    } else {
      const hoursLeft = Math.floor(minutesLeft / 60);
      const remainingMinutes = minutesLeft % 60;
      if (remainingMinutes === 0) {
        return `Paused for ${hoursLeft}h`;
      }
      return `Paused for ${hoursLeft}h ${remainingMinutes}m`;
    }
  }

  /**
   * Update the tray menu
   */
  updateMenu() {
    const menuItems = [];

    // Pause status banner (if paused)
    if (this.isPaused()) {
      const pauseStatus = this.getPauseStatus();
      menuItems.push({ 
        label: `⏸️  ${pauseStatus}`, 
        enabled: false,
        type: 'normal'
      });
      menuItems.push({
        label: 'Resume Now',
        click: () => {
          this.store.set('pausedUntil', null);
          this.updateMenu();
        }
      });
      menuItems.push({ type: 'separator' });
    }

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

    // Actions with sync status
    const syncStatus = this.getLastSyncStatus();
    menuItems.push({
      label: syncStatus === 'Just synced' ? '✓ Sync Now' : 'Sync Now',
      sublabel: syncStatus,
      click: () => this.onSync()
    });

    menuItems.push({ type: 'separator' });

    // Pause submenu (only show if not already paused)
    if (!this.isPaused()) {
      menuItems.push({
        label: 'Pause Reminders',
        submenu: [
          { label: '30 minutes', click: () => this.onPause(30) },
          { label: '1 hour', click: () => this.onPause(60) },
          { label: '2 hours', click: () => this.onPause(120) },
          { label: 'Until tomorrow', click: () => this.onPause(this.minutesUntilTomorrow()) }
        ]
      });
    }

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
    return isSafeExternalUrl(url, MEETING_HOST_ALLOWLIST);
  }

  /**
   * Update upcoming events
   * @param {Array} events - Array of upcoming events
   */
  updateEvents(events) {
    this.upcomingEvents = events;
    this.syncError = null; // Clear error on successful sync
    this.lastSyncTime = new Date();
    this.updateMenu();
  }

  /**
   * Update sync error status
   * @param {string} error - Error message
   */
  updateSyncError(error) {
    this.syncError = error;
    this.updateMenu();
  }

  /**
   * Get last sync status text
   * @returns {string}
   */
  getLastSyncStatus() {
    if (this.syncError) {
      return '⚠️ Sync Error';
    }
    if (this.lastSyncTime) {
      const minutesAgo = Math.floor((new Date() - this.lastSyncTime) / (1000 * 60));
      if (minutesAgo === 0) {
        return 'Just synced';
      } else if (minutesAgo === 1) {
        return 'Synced 1 min ago';
      } else if (minutesAgo < 60) {
        return `Synced ${minutesAgo} min ago`;
      } else {
        const hoursAgo = Math.floor(minutesAgo / 60);
        return `Synced ${hoursAgo}h ago`;
      }
    }
    return 'Not synced';
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
