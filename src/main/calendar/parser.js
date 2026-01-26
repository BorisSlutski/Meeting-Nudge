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
  },
  // Skype for Business
  {
    name: 'Skype',
    pattern: /https?:\/\/(?:meet|join)\.(?:lync|skype)\.com\/[\w/-]+/gi,
    icon: '💬'
  },
  // Gather.town
  {
    name: 'Gather',
    pattern: /https?:\/\/(?:app\.)?gather\.town\/app\/[\w-/]+/gi,
    icon: '🎮'
  },
  // Facebook Workplace Rooms
  {
    name: 'Workplace',
    pattern: /https?:\/\/[\w-]+\.workplace\.com\/[\w/-]*room[\w/-]*/gi,
    icon: '💼'
  },
  // Cisco Meeting
  {
    name: 'Cisco',
    pattern: /https?:\/\/(?:[\w-]+\.)?ciscospark\.com\/[\w/-]+/gi,
    icon: '🔵'
  }
];

/**
 * Parse conference link from event data (returns first found)
 * @param {Object} event - Calendar event with description, location, conferenceData
 * @returns {Object|null} Conference info or null
 */
function parseConferenceLink(event) {
  const allLinks = parseAllConferenceLinks(event);
  return allLinks.length > 0 ? allLinks[0] : null;
}

/**
 * Parse ALL conference links from event data
 * @param {Object} event - Calendar event with description, location, conferenceData
 * @returns {Array} Array of conference link objects
 */
function parseAllConferenceLinks(event) {
  const links = [];
  const seenUrls = new Set();

  // First, check for structured conference data (Google Calendar provides this)
  if (event.conferenceData?.entryPoints) {
    const videoEntry = event.conferenceData.entryPoints.find(
      ep => ep.entryPointType === 'video'
    );
    if (videoEntry && !seenUrls.has(videoEntry.uri)) {
      links.push({
        url: videoEntry.uri,
        name: event.conferenceData.conferenceSolution?.name || 'Video Call',
        icon: '📹'
      });
      seenUrls.add(videoEntry.uri);
    }
  }

  // Check hangoutLink field (Google Calendar specific)
  if (event.hangoutLink && !seenUrls.has(event.hangoutLink)) {
    const hangoutInfo = isConferenceLink(event.hangoutLink);
    if (hangoutInfo) {
      links.push(hangoutInfo);
      seenUrls.add(event.hangoutLink);
    }
  }

  // Search in all text fields that might contain links
  const searchText = [
    event.location || '',
    event.description || '',
    event.notes || '',
    event.body || '',
    event.htmlLink || ''
  ].join(' ');

  // Extract all conference links from the text
  for (const conf of CONFERENCE_PATTERNS) {
    // Reset regex lastIndex
    conf.pattern.lastIndex = 0;
    const matches = searchText.match(conf.pattern);
    if (matches && matches.length > 0) {
      for (const match of matches) {
        if (!seenUrls.has(match)) {
          links.push({
            url: match,
            name: conf.name,
            icon: conf.icon
          });
          seenUrls.add(match);
        }
      }
    }
  }

  return links;
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
  parseAllConferenceLinks,
  extractAllLinks,
  isConferenceLink,
  CONFERENCE_PATTERNS
};
