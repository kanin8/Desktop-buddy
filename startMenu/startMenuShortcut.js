// Keeps the app's shortcuts: one in the system's app menu (Windows Start
// Menu / Linux applications), which makes it show up in search, and one on
// the desktop. The OS-specific work lives in windowsShortcuts.js and
// linuxShortcuts.js; macOS has none yet, so it gets no shortcuts.

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const PLATFORM_SHORTCUTS = {
  win32: () => require('./windowsShortcuts'),
  linux: () => require('./linuxShortcuts'),
};

// Marker file in the app's user-data folder, written once the desktop
// shortcut has been created, so a shortcut the user deleted stays deleted.
const DESKTOP_SHORTCUT_MARKER = 'desktop-shortcut-created';

// The shortcut functions for this OS, or null where shortcuts aren't supported.
function getPlatformShortcuts() {
  const load = PLATFORM_SHORTCUTS[process.platform];
  return load ? load() : null;
}

// Setup that has to happen before any window opens (the taskbar app ID on
// Windows).
function prepareAppForShortcuts() {
  const platform = getPlatformShortcuts();
  if (platform) platform.prepareApp();
}

// Rewritten on every launch, so a moved or renamed project folder fixes its
// own app-menu entry the next time the app starts.
function ensureAppMenuShortcut(platform) {
  const shortcutPath = platform.getStartMenuShortcutPath();
  if (!platform.writeShortcut(shortcutPath)) {
    console.warn('Could not write app menu shortcut at', shortcutPath);
  }
}

// Created on the first launch only. After that an existing desktop shortcut
// is kept up to date, but one the user deleted is not brought back.
function ensureDesktopShortcut(platform) {
  const shortcutPath = platform.getDesktopShortcutPath();
  const markerPath = path.join(app.getPath('userData'), DESKTOP_SHORTCUT_MARKER);
  const createdBefore = fs.existsSync(markerPath);

  if (createdBefore && !fs.existsSync(shortcutPath)) return;

  if (!platform.writeShortcut(shortcutPath)) {
    console.warn('Could not write desktop shortcut at', shortcutPath);
    return;
  }
  if (!createdBefore) fs.writeFileSync(markerPath, new Date().toISOString());
}

// Entry point for main.js: sets up this launch's shortcuts. Never throws, as
// the app works fine without them.
function ensureShortcuts() {
  const platform = getPlatformShortcuts();
  if (!platform) return;
  try {
    ensureAppMenuShortcut(platform);
    ensureDesktopShortcut(platform);
  } catch (error) {
    console.warn('Could not set up shortcuts:', error.message);
  }
}

module.exports = { prepareAppForShortcuts, ensureShortcuts };
