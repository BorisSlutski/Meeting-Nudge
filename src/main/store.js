const Store = require('electron-store');
const keytar = require('keytar');

const SERVICE_NAME = 'meeting-nudge';

/**
 * Secure token storage using OS keychain
 */
class SecureStore {
  /**
   * Store a token securely
   * @param {string} key - Token identifier (e.g., 'google-refresh-token')
   * @param {string} value - Token value
   */
  static async setToken(key, value) {
    await keytar.setPassword(SERVICE_NAME, key, value);
  }

  /**
   * Retrieve a token
   * @param {string} key - Token identifier
   * @returns {Promise<string|null>} Token value or null
   */
  static async getToken(key) {
    return await keytar.getPassword(SERVICE_NAME, key);
  }

  /**
   * Delete a token
   * @param {string} key - Token identifier
   */
  static async deleteToken(key) {
    await keytar.deletePassword(SERVICE_NAME, key);
  }

  /**
   * Delete all tokens for this app
   */
  static async clearAllTokens() {
    const credentials = await keytar.findCredentials(SERVICE_NAME);
    for (const cred of credentials) {
      await keytar.deletePassword(SERVICE_NAME, cred.account);
    }
  }
}

/**
 * Settings store (non-sensitive data)
 */
const settingsStore = new Store({
  name: 'settings',
  defaults: {
    reminderTimes: [10, 5, 1], // minutes before meeting
    syncInterval: 5, // minutes
    soundEnabled: true,
    soundFile: 'alert.mp3',
    googleConnected: false,
    pausedUntil: null,
    theme: 'dark',
    autoStart: false
  }
});

module.exports = {
  SecureStore,
  settingsStore
};
