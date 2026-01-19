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
   */
  async initializeClient() {
    await this.loadCredentials();
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google OAuth credentials not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Settings or environment.');
    }

    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      'http://localhost:8089/oauth/google/callback'
    );

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Start OAuth authentication flow
   * @returns {Promise<void>}
   */
  async authenticate() {
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
        finish(error);
      });

      server.listen(8089, '127.0.0.1', () => {
        console.log('Google OAuth callback server listening on port 8089');
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
   * Get upcoming events
   * @returns {Promise<Array>} Array of events
   */
  async getUpcomingEvents() {
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

      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: oneWeekLater.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100
      });

      const events = response.data.items || [];
      
      return events.map(event => {
        const conferenceInfo = parseConferenceLink({
          description: event.description,
          location: event.location,
          conferenceData: event.conferenceData
        });

        return {
          id: `google-${event.id}`,
          title: event.summary || 'Untitled Event',
          start: event.start.dateTime || event.start.date,
          end: event.end.dateTime || event.end.date,
          location: event.location || '',
          description: event.description || '',
          source: 'google',
          conferenceLink: conferenceInfo?.url || null,
          conferenceName: conferenceInfo?.name || null,
          conferenceIcon: conferenceInfo?.icon || null,
          htmlLink: event.htmlLink
        };
      });
    } catch (error) {
      console.error('Error fetching Google Calendar events:', error);
      
      // If token expired, clear it
      if (error.code === 401) {
        await this.disconnect();
        this.store.set('googleConnected', false);
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
