/**
 * Meeting link parser - extracts video conference URLs from calendar events
 */

// Conference link patterns
const CONFERENCE_PATTERNS = [
  // Zoom
  {
    name: 'Zoom',
    pattern: /https?:\/\/(?:[\w-]+\.)?zoom\.us\/(?:j|my)\/[\w-]+(?:\?[\w=&-]*)?/gi,
    icon: '📹'
  },
  // Google Meet
  {
    name: 'Google Meet',
    pattern: /https?:\/\/meet\.google\.com\/[\w-]+/gi,
    icon: '🟢'
  },
  // Microsoft Teams
  {
    name: 'Microsoft Teams',
    pattern: /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[\w%\-@.]+/gi,
    icon: '🟣'
  },
  // Webex
  {
    name: 'Webex',
    pattern: /https?:\/\/(?:[\w-]+\.)?webex\.com\/(?:meet|join)\/[\w-]+/gi,
    icon: '🔵'
  },
  // GoTo Meeting
  {
    name: 'GoTo Meeting',
    pattern: /https?:\/\/(?:[\w-]+\.)?gotomeet(?:ing)?\.com\/[\w-]+/gi,
    icon: '🟠'
  },
  // BlueJeans
  {
    name: 'BlueJeans',
    pattern: /https?:\/\/(?:[\w-]+\.)?bluejeans\.com\/[\w-]+/gi,
    icon: '🔷'
  },
  // Slack Huddle
  {
    name: 'Slack',
    pattern: /https?:\/\/(?:[\w-]+\.)?slack\.com\/[\w/-]+huddle[\w/-]*/gi,
    icon: '💬'
  },
  // Discord
  {
    name: 'Discord',
    pattern: /https?:\/\/discord\.(?:gg|com)\/[\w/-]+/gi,
    icon: '🎮'
  },
  // Whereby
  {
    name: 'Whereby',
    pattern: /https?:\/\/whereby\.com\/[\w-]+/gi,
    icon: '📞'
  },
  // Around
  {
    name: 'Around',
    pattern: /https?:\/\/(?:[\w-]+\.)?around\.co\/[\w-]+/gi,
    icon: '⭕'
  },
  // Jitsi
  {
    name: 'Jitsi',
    pattern: /https?:\/\/meet\.jit\.si\/[\w-]+/gi,
    icon: '🎥'
  },
  // Amazon Chime
  {
    name: 'Amazon Chime',
    pattern: /https?:\/\/chime\.aws\/[\w-]+/gi,
    icon: '📱'
  },
  // RingCentral
  {
    name: 'RingCentral',
    pattern: /https?:\/\/(?:[\w-]+\.)?ringcentral\.com\/[\w/-]+/gi,
    icon: '📞'
  }
];

/**
 * Parse conference link from event data
 * @param {Object} event - Calendar event with description, location, conferenceData
 * @returns {Object|null} Conference info or null
 */
function parseConferenceLink(event) {
  // First, check for structured conference data (Google Calendar provides this)
  if (event.conferenceData?.entryPoints) {
    const videoEntry = event.conferenceData.entryPoints.find(
      ep => ep.entryPointType === 'video'
    );
    if (videoEntry) {
      return {
        url: videoEntry.uri,
        name: event.conferenceData.conferenceSolution?.name || 'Video Call',
        icon: '📹'
      };
    }
  }

  // Search in location, description, and notes
  const searchText = [
    event.location || '',
    event.description || '',
    event.notes || '',
    event.body || ''
  ].join(' ');

  for (const conf of CONFERENCE_PATTERNS) {
    const matches = searchText.match(conf.pattern);
    if (matches && matches.length > 0) {
      return {
        url: matches[0],
        name: conf.name,
        icon: conf.icon
      };
    }
  }

  return null;
}

/**
 * Extract all links from text
 * @param {string} text - Text to search
 * @returns {Array} Array of found links
 */
function extractAllLinks(text) {
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const matches = text.match(urlPattern) || [];
  return [...new Set(matches)]; // Remove duplicates
}

/**
 * Determine if a link is a conference link
 * @param {string} url - URL to check
 * @returns {Object|null} Conference info or null
 */
function isConferenceLink(url) {
  for (const conf of CONFERENCE_PATTERNS) {
    if (conf.pattern.test(url)) {
      // Reset regex lastIndex
      conf.pattern.lastIndex = 0;
      return {
        url,
        name: conf.name,
        icon: conf.icon
      };
    }
  }
  return null;
}

module.exports = {
  parseConferenceLink,
  extractAllLinks,
  isConferenceLink,
  CONFERENCE_PATTERNS
};
