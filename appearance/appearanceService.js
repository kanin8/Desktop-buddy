// Main-process side of the appearance settings: loads the saved choices,
// applies the theme through Electron, and answers the Settings window.
// Every window follows the theme on its own via prefers-color-scheme.

const path = require('path');
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const { createAppearanceStore } = require('./appearanceSettings');
const CONFIG = require('../config');

let store = null;

// The store is created on first use, because app.getPath('userData') is only
// reliable once Electron has started.
function getStore() {
  if (!store) {
    store = createAppearanceStore({ filePath: path.join(app.getPath('userData'), 'appearance.json') });
    store.load();
  }
  return store;
}

// Tells Electron which theme to use. This also sets prefers-color-scheme in
// every window, which is what switches the colours in styles/tokens.css.
function applyTheme(theme) {
  nativeTheme.themeSource = theme;
}

// The settings plus the slider limits from config.js, which the renderers
// can't read themselves.
function describeAppearance(settings) {
  return Object.assign({}, settings, {
    surfaceOpacityRange: {
      min: CONFIG.SURFACE_OPACITY_MIN,
      max: CONFIG.SURFACE_OPACITY_MAX,
      step: CONFIG.SURFACE_OPACITY_STEP,
    },
  });
}

// Sends the current settings to every open window, so the overlay can update
// its message transparency and Settings stays in sync.
function broadcastAppearance(settings) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send('appearance-changed', settings);
  });
}

// Background for a solid window before its page has painted, in the colour
// the page itself will use.
function getWindowBackgroundColor() {
  return nativeTheme.shouldUseDarkColors ? CONFIG.PANEL_BG_DARK : CONFIG.PANEL_BG_LIGHT;
}

// Applies the saved theme and forces the Pomodoro timer to be shown on every
// launch. Call once at startup, before creating windows, so they open in the
// right colours.
function initAppearance() {
  const settings = getStore().update({ showStudyTimer: true });
  applyTheme(settings.theme);
}

// Answers the renderers: 'appearance-get' returns the settings,
// 'appearance-set' saves a partial change, applies it and tells every window.
function registerAppearanceIpc() {
  ipcMain.handle('appearance-get', () => describeAppearance(getStore().read()));
  ipcMain.handle('appearance-set', (_event, patch) => {
    const settings = describeAppearance(getStore().update(patch));
    applyTheme(settings.theme);
    broadcastAppearance(settings);
    return settings;
  });
}

module.exports = { initAppearance, registerAppearanceIpc, getWindowBackgroundColor };
