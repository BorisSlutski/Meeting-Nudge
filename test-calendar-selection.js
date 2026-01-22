// Test script to verify calendar selection functionality
// Run with: node test-calendar-selection.js

const fs = require('fs');
const path = require('path');

// Check if calendar selection code exists and is properly structured
console.log('🔍 Testing Calendar Selection Functionality...\n');

// 1. Check if the main calendar handler exists
const mainJs = fs.readFileSync(path.join(__dirname, 'src/main/index.js'), 'utf8');
const hasSaveHandler = mainJs.includes('save-selected-calendars');
console.log(`${hasSaveHandler ? '✅' : '❌'} Main process save handler exists`);

// 2. Check if preload API exposes the function
const preloadJs = fs.readFileSync(path.join(__dirname, 'src/preload.js'), 'utf8');
const hasPreloadAPI = preloadJs.includes('saveSelectedCalendars');
console.log(`${hasPreloadAPI ? '✅' : '❌'} Preload API exposes saveSelectedCalendars`);

// 3. Check if settings script calls the API
const settingsJs = fs.readFileSync(path.join(__dirname, 'src/renderer/settings/script.js'), 'utf8');
const hasSettingsCall = settingsJs.includes('window.electronAPI.saveSelectedCalendars');
console.log(`${hasSettingsCall ? '✅' : '❌'} Settings script calls saveSelectedCalendars API`);

// 4. Check if event delegation is properly set up
const hasEventDelegation = settingsJs.includes('calendarsList.addEventListener(\'change\'');
console.log(`${hasEventDelegation ? '✅' : '❌'} Event delegation properly configured`);

// 5. Check if CSS styling exists for checkboxes
const cssFile = fs.readFileSync(path.join(__dirname, 'src/renderer/settings/style.css'), 'utf8');
const hasCheckboxStyling = cssFile.includes('.calendar-checkbox');
console.log(`${hasCheckboxStyling ? '✅' : '❌'} Calendar checkbox CSS styling exists`);

// 6. Check HTML structure
const htmlFile = fs.readFileSync(path.join(__dirname, 'src/renderer/settings/index.html'), 'utf8');
const hasCalendarsList = htmlFile.includes('id="calendars-list"');
console.log(`${hasCalendarsList ? '✅' : '❌'} Calendars list container exists in HTML`);

// Summary
const allChecks = [hasSaveHandler, hasPreloadAPI, hasSettingsCall, hasEventDelegation, hasCheckboxStyling, hasCalendarsList];
const passed = allChecks.filter(Boolean).length;
const total = allChecks.length;

console.log(`\n📊 Test Results: ${passed}/${total} checks passed`);

if (passed === total) {
  console.log('🎉 All calendar selection components are properly configured!');
  console.log('\n🔧 To test manually:');
  console.log('1. Start the app: npm start');
  console.log('2. Open Settings → Calendar Selection');
  console.log('3. Connect Google Calendar');
  console.log('4. Check/uncheck calendar checkboxes');
  console.log('5. Check browser console for debugging output');
  console.log('6. Verify "Saving..." and "✓ Saved X calendar(s)" messages appear');
} else {
  console.log('⚠️  Some components may be missing or misconfigured.');
  console.log('Check the failed items above.');
}