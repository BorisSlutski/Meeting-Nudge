const { google } = require('googleapis');
const { BrowserWindow } = require('electron');
const crypto = require('crypto');
const { SecureStore } = require('../store');
const { parseConferenceLink } = require('./parser');

// OAuth configuration
// Users need to create their own Google Cloud project and get these credentials
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKEN_KEY = 'google-refresh-token';
const CLIENT_ID_KEY = 'google-client-id';
const CLIENT_SECRET_KEY = 'google-client-secret';

/**
 * Google Calendar integration
 */
class GoogleCalendar {
  constructor(store) {
    this.store = store;
    this.oauth2Client = null;
    this.calendar = null;
    
    // These should be set by the user in settings or environment
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  }

  generatePkcePair() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  /**
   * Initialize OAuth client
   * @param {number} port - Optional port for redirect URI (defaults to 8089)
   */
  async initializeClient(port = 8089) {
    await this.loadCredentials();
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google OAuth credentials not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Settings or environment.');
    }

    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      `http://localhost:${port}/oauth/google/callback`
    );

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Find an available port in the range 8089-8099
   * @returns {Promise<number>} Available port number
   */
  async findAvailablePort() {
    const http = require('http');
    const MIN_PORT = 8089;
    const MAX_PORT = 8099;
    
    for (let port = MIN_PORT; port <= MAX_PORT; port++) {
      try {
        await new Promise((resolve, reject) => {
          const testServer = http.createServer();
          testServer.once('error', (err) => {
            testServer.close();
            reject(err);
          });
          testServer.once('listening', () => {
            testServer.close();
            resolve();
          });
          testServer.listen(port, '127.0.0.1');
        });
        return port;
      } catch (error) {
        // Port in use, try next one
        continue;
      }
    }
    throw new Error(`No available ports in range ${MIN_PORT}-${MAX_PORT}`);
  }

  /**
   * Start OAuth authentication flow
   * @returns {Promise<void>}
   */
  async authenticate() {
    // Initialize with default port for checking existing token
    await this.initializeClient();

    // Check for existing refresh token
    const existingToken = await SecureStore.getToken(TOKEN_KEY);
    if (existingToken) {
      try {
        this.oauth2Client.setCredentials({ refresh_token: existingToken });
        // Try to refresh the token
        await this.oauth2Client.getAccessToken();
        console.log('Google: Using existing refresh token');
        return;
      } catch (error) {
        console.log('Google: Existing token invalid, re-authenticating');
        await SecureStore.deleteToken(TOKEN_KEY);
      }
    }

    // Find available port for new authentication
    const port = await this.findAvailablePort();
    console.log(`Google OAuth: Using port ${port}`);
    
    // Re-initialize with the available port
    await this.initializeClient(port);

    // Start OAuth flow
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const state = crypto.randomBytes(16).toString('hex');
      const { codeVerifier, codeChallenge } = this.generatePkcePair();
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      });

      // Create auth window
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        title: 'Connect Google Calendar',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      // Start local server to receive callback
      const http = require('http');
      const url = require('url');

      const server = http.createServer(async (req, res) => {
        try {
          const parsedUrl = url.parse(req.url, true);
          
          if (parsedUrl.pathname === '/oauth/google/callback') {
            const code = parsedUrl.query.code;
            const returnedState = parsedUrl.query.state;
            
            if (returnedState !== state) {
              res.writeHead(400);
              res.end('Invalid OAuth state');
              server.close();
              authWindow.close();
              finish(new Error('Invalid OAuth state'));
              return;
            }

            if (code) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <body style="font-family: system-ui; text-align: center; padding-top: 50px;">
                    <h1>✅ Connected!</h1>
                    <p>You can close this window.</p>
                    <script>window.close();</script>
                  </body>
                </html>
              `);

              // Exchange code for tokens
              const { tokens } = await this.oauth2Client.getToken({
                code,
                codeVerifier
              });
              this.oauth2Client.setCredentials(tokens);

              // Store refresh token securely
              if (tokens.refresh_token) {
                await SecureStore.setToken(TOKEN_KEY, tokens.refresh_token);
              }

              server.close();
              authWindow.close();
              finish();
            } else {
              res.writeHead(400);
              res.end('No authorization code received');
              server.close();
              authWindow.close();
              finish(new Error('No authorization code received'));
            }
          }
        } catch (error) {
          server.close();
          authWindow.close();
          finish(error);
        }
      });

      server.on('error', (error) => {
        authWindow.close();
        finish(new Error(`OAuth server error on port ${port}: ${error.message}`));
      });

      server.listen(port, '127.0.0.1', () => {
        console.log(`Google OAuth callback server listening on port ${port}`);
        authWindow.loadURL(authUrl);
      });

      // Handle window close
      authWindow.on('closed', () => {
        server.close();
        finish(new Error('OAuth window closed'));
      });
    });
  }

  /**
   * Disconnect Google Calendar
   */
  async disconnect() {
    await SecureStore.deleteToken(TOKEN_KEY);
    this.oauth2Client = null;
    this.calendar = null;
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  async isConnected() {
    const token = await SecureStore.getToken(TOKEN_KEY);
    return !!token;
  }

  /**
   * List all user's calendars
   * @returns {Promise<Array>} Array of calendars with id, summary, primary, etc.
   */
  async listCalendars() {
    if (!this.oauth2Client || !this.calendar) {
      await this.initializeClient();
    }

    try {
      const response = await this.calendar.calendarList.list();
      return response.data.items.map(cal => ({
        id: cal.id,
        summary: cal.summary || 'Untitled Calendar',
        primary: cal.primary || false,
        backgroundColor: cal.backgroundColor || '#3788d8',
        accessRole: cal.accessRole || 'reader',
        selected: false // Will be set by UI based on user preferences
      }));
    } catch (error) {
      console.error('Failed to list calendars:', error);
      throw new Error(`Failed to list calendars: ${error.message}`);
    }
  }

  /**
   * Create a new calendar
   * @param {Object} calendarData - Calendar data
   * @param {string} calendarData.summary - Calendar name/title
   * @param {string} [calendarData.description] - Calendar description
   * @param {string} [calendarData.location] - Calendar location
   * @param {string} [calendarData.timeZone] - Calendar timezone
   * @returns {Promise<Object>} Created calendar object
   */
  async createCalendar(calendarData) {
    if (!this.oauth2Client || !this.calendar) {
      await this.initializeClient();
    }

    if (!calendarData.summary || calendarData.summary.trim() === '') {
      throw new Error('Calendar name is required');
    }

    try {
      const calendarResource = {
        summary: calendarData.summary.trim(),
        description: calendarData.description || '',
        location: calendarData.location || '',
        timeZone: calendarData.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      const response = await this.calendar.calendars.insert({
        resource: calendarResource
      });

      console.log('Created calendar:', response.data.id);
      return {
        id: response.data.id,
        summary: response.data.summary,
        description: response.data.description || '',
        location: response.data.location || '',
        timeZone: response.data.timeZone,
        primary: false,
        backgroundColor: '#3788d8', // Default color
        accessRole: 'owner',
        selected: true // Auto-select newly created calendars
      };
    } catch (error) {
      console.error('Failed to create calendar:', error);
      throw new Error(`Failed to create calendar: ${error.message}`);
    }
  }

  /**
   * Get upcoming events from multiple calendars
   * @param {Array<string>} calendarIds - Array of calendar IDs to fetch from (defaults to ['primary'])
   * @returns {Promise<Array>} Array of events from all specified calendars
   */
  async getUpcomingEvents(calendarIds = ['primary']) {
    if (!this.oauth2Client || !this.calendar) {
      // Try to restore from saved token
      const token = await SecureStore.getToken(TOKEN_KEY);
      if (token) {
        try {
          await this.initializeClient();
          this.oauth2Client.setCredentials({ refresh_token: token });
        } catch (error) {
          // Credentials not configured - return empty array silently
          console.log('Google Calendar: Credentials not configured, skipping sync');
          return [];
        }
      } else {
        return [];
      }
    }

    try {
      const now = new Date();
      const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const allEvents = [];

      // Fetch events from each selected calendar
      for (const calendarId of calendarIds) {
        try {
          console.log(`Fetching events from calendar: ${calendarId}`);

          const response = await this.calendar.events.list({
            calendarId: calendarId,
            timeMin: now.toISOString(),
            timeMax: oneWeekLater.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 100
          });

          const events = response.data.items || [];

          // Map events with calendar information
          const mappedEvents = events.map(event => {
            const conferenceInfo = parseConferenceLink({
              description: event.description,
              location: event.location,
              conferenceData: event.conferenceData
            });

            return {
              id: `google-${calendarId}-${event.id}`,
              title: event.summary || 'Untitled Event',
              start: event.start.dateTime || event.start.date,
              end: event.end.dateTime || event.end.date,
              location: event.location || '',
              description: event.description || '',
              source: 'google',
              calendarId: calendarId,
              calendarName: calendarId === 'primary' ? 'Primary' : calendarId,
              conferenceLink: conferenceInfo?.link || null,
              conferenceName: conferenceInfo?.name || null,
              conferenceIcon: conferenceInfo?.icon || null,
              reminderMinutes: 10 // Default, will be overridden by scheduler
            };
          });

          allEvents.push(...mappedEvents);
          console.log(`Fetched ${mappedEvents.length} events from ${calendarId}`);

        } catch (calendarError) {
          console.error(`Failed to fetch events from calendar ${calendarId}:`, calendarError.message);
          // Continue with other calendars even if one fails
        }
      }

      // Sort all events by start time
      allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

      console.log(`Total events from ${calendarIds.length} calendars: ${allEvents.length}`);
      return allEvents;
    } catch (error) {
      console.error('Error fetching Google Calendar events:', error);
      
      // If token expired or invalid auth, clear it and notify user
      if (error.code === 401 || error.code === 403) {
        await this.disconnect();
        this.store.set('googleConnected', false);
        
        // Show notification to user
        const { dialog, BrowserWindow } = require('electron');
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
          dialog.showMessageBox(windows[0], {
            type: 'warning',
            title: 'Google Calendar Disconnected',
            message: 'Your Google Calendar connection expired',
            detail: 'Please reconnect your Google Calendar in Settings to continue receiving meeting reminders.',
            buttons: ['OK']
          });
        }
        
        throw new Error('Google Calendar authentication expired. Please reconnect in Settings.');
      }
      
      return [];
    }
  }

  async loadCredentials() {
    if (this.clientId && this.clientSecret) {
      return;
    }
    const [clientId, clientSecret] = await Promise.all([
      SecureStore.getToken(CLIENT_ID_KEY),
      SecureStore.getToken(CLIENT_SECRET_KEY)
    ]);
    if (!this.clientId) {
      this.clientId = clientId || '';
    }
    if (!this.clientSecret) {
      this.clientSecret = clientSecret || '';
    }
  }
}

module.exports = { GoogleCalendar };
