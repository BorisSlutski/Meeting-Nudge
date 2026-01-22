const log = require('electron-log');
const path = require('path');
const { app } = require('electron');

/**
 * Configure logging system
 */
function setupLogger() {
  // Set log file location
  log.transports.file.resolvePathFn = () => {
    return path.join(app.getPath('userData'), 'logs', 'meeting-nudge.log');
  };

  // Configure file transport
  log.transports.file.level = 'info';
  log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

  // Configure console transport
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
  log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}';

  // Add timestamp to all logs
  log.hooks.push((message, transport) => {
    message.date = new Date();
    return message;
  });

  return log;
}

/**
 * Create a scoped logger for a specific module
 * @param {string} scope - Module name (e.g., 'calendar', 'scheduler')
 * @returns {Object} Logger with scoped methods
 */
function createLogger(scope) {
  return {
    debug: (...args) => log.debug(`[${scope}]`, ...args),
    info: (...args) => log.info(`[${scope}]`, ...args),
    warn: (...args) => log.warn(`[${scope}]`, ...args),
    error: (...args) => log.error(`[${scope}]`, ...args),
    verbose: (...args) => log.verbose(`[${scope}]`, ...args),
  };
}

/**
 * Get log file path
 * @returns {string} Path to log file
 */
function getLogPath() {
  return log.transports.file.getFile().path;
}

// Initialize logger
setupLogger();

module.exports = {
  log,
  createLogger,
  getLogPath,
  setupLogger
};
