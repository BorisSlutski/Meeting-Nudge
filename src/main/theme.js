const { nativeTheme } = require('electron');

/**
 * Theme manager for dark/light mode
 */
class ThemeManager {
  constructor(store) {
    this.store = store;
    this.currentTheme = this.store.get('theme') || 'system';
    
    // Listen for system theme changes
    nativeTheme.on('updated', () => {
      if (this.currentTheme === 'system') {
        this.applyTheme();
      }
    });
  }

  /**
   * Get current theme (resolved)
   * @returns {string} 'light' or 'dark'
   */
  getCurrentTheme() {
    if (this.currentTheme === 'system') {
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    }
    return this.currentTheme;
  }

  /**
   * Set theme
   * @param {string} theme - 'light', 'dark', or 'system'
   */
  setTheme(theme) {
    if (!['light', 'dark', 'system'].includes(theme)) {
      throw new Error('Invalid theme. Must be "light", "dark", or "system"');
    }
    
    this.currentTheme = theme;
    this.store.set('theme', theme);
    this.applyTheme();
  }

  /**
   * Apply theme to Electron windows
   * @returns {string} Resolved theme ('light' or 'dark')
   */
  applyTheme() {
    const resolvedTheme = this.getCurrentTheme();
    nativeTheme.themeSource = this.currentTheme;
    return resolvedTheme;
  }

  /**
   * Get theme preference
   * @returns {Object} { preference: string, resolved: string }
   */
  getThemePreference() {
    return {
      preference: this.currentTheme,
      resolved: this.getCurrentTheme()
    };
  }
}

module.exports = { ThemeManager };
