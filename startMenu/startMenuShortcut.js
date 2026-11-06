// Keeps a Start Menu shortcut for the app on Windows, which is what makes it
// show up in Windows Search. Does nothing on other platforms.

const { app, shell } = require('electron');
const path = require('path');
const CONFIG = require('../config');

// Ties the running app's taskbar button to the shortcut, so a pinned shortcut
// and the open app share one taskbar slot. Must run before any window opens.
function applyAppUserModelId() {
  if (process.platform !== 'win32') return;
  app.setAppUserModelId(CONFIG.APP_USER_MODEL_ID);
}

// Writes (or overwrites) the Start Menu shortcut. Called on every launch, so a
// moved or renamed project folder fixes its own shortcut the next time the
// app starts. Failures are only logged: the app works fine without it.
function ensureStartMenuShortcut() {
  if (process.platform !== 'win32') return;

  const shortcutPath = path.join(
    app.getPath('appData'),
    'Microsoft', 'Windows', 'Start Menu', 'Programs',
    `${CONFIG.APP_DISPLAY_NAME}.lnk`
  );
  const projectRoot = app.getAppPath();

  // In development Electron's own exe runs the app, so the project folder is
  // passed as its argument (quoted, as the path can contain spaces). A
  // packaged build is its own exe and needs no argument.
  const shortcutOptions = {
    target: process.execPath,
    args: app.isPackaged ? '' : `"${projectRoot}"`,
    cwd: projectRoot,
    icon: path.join(projectRoot, 'icon.ico'),
    iconIndex: 0,
    description: CONFIG.APP_DESCRIPTION,
    appUserModelId: CONFIG.APP_USER_MODEL_ID,
  };

  const written = shell.writeShortcutLink(shortcutPath, 'create', shortcutOptions);
  if (!written) console.warn('Could not write Start Menu shortcut at', shortcutPath);
}

module.exports = { applyAppUserModelId, ensureStartMenuShortcut };
