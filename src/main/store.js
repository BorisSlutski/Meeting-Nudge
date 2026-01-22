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
   * @throws {Error} If keychain access fails
   */
  static async setToken(key, value) {
    try {
      await keytar.setPassword(SERVICE_NAME, key, value);
    } catch (error) {
      console.error(`Failed to store token '${key}':`, error.message);
      throw new Error(`Keychain access denied or unavailable: ${error.message}`);
    }
  }

  /**
   * Retrieve a token
   * @param {string} key - Token identifier
   * @returns {Promise<string|null>} Token value or null
   */
  static async getToken(key) {
    try {
      return await keytar.getPassword(SERVICE_NAME, key);
    } catch (error) {
      console.error(`Failed to retrieve token '${key}':`, error.message);
      return null; // Return null on error to allow graceful degradation
    }
  }

  /**
   * Delete a token
   * @param {string} key - Token identifier
   * @returns {Promise<boolean>} True if successful
   */
  static async deleteToken(key) {
    try {
      const result = await keytar.deletePassword(SERVICE_NAME, key);
      return result;
    } catch (error) {
      console.error(`Failed to delete token '${key}':`, error.message);
      return false;
    }
  }

  /**
   * Delete all tokens for this app
   * @returns {Promise<number>} Number of tokens deleted
   */
  static async clearAllTokens() {
    try {
      const credentials = await keytar.findCredentials(SERVICE_NAME);
      let deletedCount = 0;
      for (const cred of credentials) {
        try {
          await keytar.deletePassword(SERVICE_NAME, cred.account);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete token '${cred.account}':`, error.message);
        }
      }
      return deletedCount;
    } catch (error) {
      console.error('Failed to clear all tokens:', error.message);
      return 0;
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
    soundFile: 'default.mp3', // Changed from alert.mp3
    soundVolume: 70, // 0-100
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
