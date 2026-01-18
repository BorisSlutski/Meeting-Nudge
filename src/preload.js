const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Calendar connections
  connectGoogle: () => ipcRenderer.invoke('connect-google'),
  disconnectGoogle: () => ipcRenderer.invoke('disconnect-google'),
  // Events
  getUpcomingEvents: () => ipcRenderer.invoke('get-upcoming-events'),
  syncCalendars: () => ipcRenderer.invoke('sync-calendars'),

  // Blocking window actions
  acknowledgeMeeting: () => ipcRenderer.invoke('acknowledge-meeting'),
  snoozeMeeting: (minutes) => ipcRenderer.invoke('snooze-meeting', minutes),
  joinMeeting: (url) => ipcRenderer.invoke('join-meeting', url),

  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Event listeners for blocking window
  onShowEvent: (callback) => {
    ipcRenderer.on('show-event', (event, data) => callback(data));
  },
  onUpdateEvent: (callback) => {
    ipcRenderer.on('update-event', (event, data) => callback(data));
  }
});
