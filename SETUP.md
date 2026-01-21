# Meeting Nudge - Setup Instructions

## Prerequisites
- macOS 14 (Sonoma) or macOS 15 (Sequoia) - **NOT macOS 26 beta**
- Node.js 20.x
- npm 10.x

## Installation

```bash
# 1. Install dependencies
npm install

# 2. Set up Google Calendar OAuth (required for calendar sync)
# Get credentials from: https://console.cloud.google.com
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"

# 3. Run the app
npm start
```

## Development

```bash
# Run with logging (development mode)
npm run dev

# Build for distribution
npm run build:mac      # macOS
npm run build:win      # Windows
npm run build:linux    # Linux

# Test the built app (with correct name in dock)
open "dist/mac-arm64/Meeting Nudge.app"  # macOS after building
```

**Note:** In development mode (`npm start`), the dock tooltip may show "Electron" due to macOS caching. The built app always shows "Meeting Nudge" correctly.

## Testing the App

Once the app starts:

1. **Check System Tray**
   - Look for the owl icon in your menu bar (macOS) or system tray
   - Hover over it - tooltip should say "Meeting Nudge"

2. **Open Settings**
   - Right-click the tray icon → Click "Settings"
   - Window title should be "Meeting Nudge - Settings"

3. **Connect Calendar**
   - In Settings, click "Connect" for Google Calendar
   - Follow the OAuth flow
   - Once connected, meetings will sync automatically

4. **Test Reminders**
   - The app will show full-screen blocking alerts before meetings
   - Default reminders: 10, 5, and 1 minute before meetings

## Known Issues

### macOS 26.2 Beta Incompatibility
**Do not use this app on macOS 26.2 beta**. There's a system-wide Electron compatibility issue where `require('electron')` doesn't load APIs correctly. This affects all Electron apps, not just this one.

**Solution**: Use macOS 15 (Sequoia stable) or macOS 14 (Sonoma).

## Features

- ✅ Owl icon branding throughout
- ✅ Full-screen blocking alerts
- ✅ Google Calendar integration
- ✅ Multiple reminder times
- ✅ One-click meeting join
- ✅ Snooze functionality
- ✅ Pause reminders option
- ✅ Cross-platform support

## Troubleshooting

### App won't start
1. Check Node.js version: `node --version` (should be 20.x)
2. Check macOS version: `sw_vers` (should NOT be 26.x)
3. Reinstall dependencies: `rm -rf node_modules package-lock.json && npm install`

### Tray icon not showing
- Make sure the app is running: check Activity Monitor
- On macOS, check System Settings → Control Center → Menu Bar Items

### Settings window won't open
- Right-click the tray icon (don't left-click on macOS)
- Check if window is hidden behind other apps

## Support

For issues or questions, check the README.md file.
