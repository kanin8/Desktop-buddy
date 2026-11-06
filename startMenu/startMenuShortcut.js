// Keeps Windows shortcuts for the app: one in the Start Menu, which is what
// makes it show up in Windows Search, and one on the desktop. Does nothing on
// other platforms.

const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const CONFIG = require('../config');

// Marker file in the app's user-data folder, written once the desktop
// shortcut has been created, so a shortcut the user deleted stays deleted.
const DESKTOP_SHORTCUT_MARKER = 'desktop-shortcut-created';

// Ties the running app's taskbar button to the shortcuts, so a pinned
// shortcut and the open app share one taskbar slot. Must run before any
// window opens.
function applyAppUserModelId() {
  if (process.platform !== 'win32') return;
  app.setAppUserModelId(CONFIG.APP_USER_MODEL_ID);
}

// The shortcut target, icon and app ID, shared by every shortcut the app makes.
function getShortcutOptions() {
  const projectRoot = app.getAppPath();
  return {
    target: process.execPath,
    // In development Electron's own exe runs the app, so the project folder
    // is passed as its argument (quoted, as the path can contain spaces). A
    // packaged build is its own exe and needs no argument.
    args: app.isPackaged ? '' : `"${projectRoot}"`,
    cwd: projectRoot,
    icon: path.join(projectRoot, 'icon.ico'),
    iconIndex: 0,
    description: CONFIG.APP_DESCRIPTION,
    appUserModelId: CONFIG.APP_USER_MODEL_ID,
  };
}

// Writes (or overwrites) one shortcut. Failures are only logged: the app works
// fine without its shortcuts.
function writeShortcut(shortcutPath) {
  const written = shell.writeShortcutLink(shortcutPath, 'create', getShortcutOptions());
  if (!written) console.warn('Could not write shortcut at', shortcutPath);
  return written;
}

// Rewritten on every launch, so a moved or renamed project folder fixes its
// own Start Menu entry the next time the app starts.
function ensureStartMenuShortcut() {
  const shortcutPath = path.join(
    app.getPath('appData'),
    'Microsoft', 'Windows', 'Start Menu', 'Programs',
    `${CONFIG.APP_DISPLAY_NAME}.lnk`
  );
  writeShortcut(shortcutPath);
}

// Created on the first launch only. After that an existing desktop shortcut
// is kept up to date, but one the user deleted is not brought back.
function ensureDesktopShortcut() {
  const shortcutPath = path.join(app.getPath('desktop'), `${CONFIG.APP_DISPLAY_NAME}.lnk`);
  const markerPath = path.join(app.getPath('userData'), DESKTOP_SHORTCUT_MARKER);
  const createdBefore = fs.existsSync(markerPath);

  if (createdBefore && !fs.existsSync(shortcutPath)) return;

  if (writeShortcut(shortcutPath) && !createdBefore) {
    fs.writeFileSync(markerPath, new Date().toISOString());
  }
}

// Entry point for main.js: sets up all Windows shortcuts for this launch.
function ensureShortcuts() {
  if (process.platform !== 'win32') return;
  ensureStartMenuShortcut();
  ensureDesktopShortcut();
}

module.exports = { applyAppUserModelId, ensureShortcuts };
