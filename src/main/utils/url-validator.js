/**
 * URL validation utilities for Meeting Nudge
 * Shared across main process and tray modules
 */

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

const EXTERNAL_HOST_ALLOWLIST = [
  'console.cloud.google.com',
  'cloud.google.com',
  'developers.google.com',
  'accounts.google.com'
];

/**
 * Check if a hostname is in the allowlist
 * @param {string} hostname - Hostname to check
 * @param {Array<string>} allowlist - List of allowed hosts
 * @returns {boolean} True if hostname is allowed
 */
function isAllowedHost(hostname, allowlist) {
  const host = String(hostname || '').toLowerCase();
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * Validate if a URL is safe to open externally
 * @param {string} url - URL to validate
 * @param {Array<string>} allowlist - List of allowed hosts (optional)
 * @returns {boolean} True if URL is safe
 */
function isSafeExternalUrl(url, allowlist = null) {
  if (typeof url !== 'string') return false;
  
  try {
    const parsed = new URL(url);
    
    // Only allow HTTPS
    if (!['https:'].includes(parsed.protocol)) {
      return false;
    }
    
    // If allowlist provided, check hostname
    if (Array.isArray(allowlist) && allowlist.length > 0) {
      return isAllowedHost(parsed.hostname, allowlist);
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  isAllowedHost,
  isSafeExternalUrl,
  MEETING_HOST_ALLOWLIST,
  EXTERNAL_HOST_ALLOWLIST
};
