const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Calendar connections
  connectGoogle: () => ipcRenderer.invoke('connect-google'),
  disconnectGoogle: () => ipcRenderer.invoke('disconnect-google'),
  getOAuthConfig: () => ipcRenderer.invoke('get-oauth-config'),
  saveOAuthConfig: (config) => ipcRenderer.invoke('save-oauth-config', config),
  // Events
  getUpcomingEvents: () => ipcRenderer.invoke('get-upcoming-events'),
  syncCalendars: () => ipcRenderer.invoke('sync-calendars'),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),

  // Blocking window actions
  acknowledgeMeeting: () => ipcRenderer.invoke('acknowledge-meeting'),
  snoozeMeeting: (data) => ipcRenderer.invoke('snooze-meeting', data),
  joinMeeting: (url) => ipcRenderer.invoke('join-meeting', url),

  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Theme
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),

  // Event listeners for blocking window
  onShowEvent: (callback) => {
    ipcRenderer.on('show-event', (event, data) => callback(data));
  },
  onUpdateEvent: (callback) => {
    ipcRenderer.on('update-event', (event, data) => callback(data));
  }
});
