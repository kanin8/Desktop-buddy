// Windows side of the app shortcuts: .lnk files in the Start Menu (which is
// what Windows Search lists) and on the desktop.

const { app, shell } = require('electron');
const path = require('path');
const CONFIG = require('../config');

// Ties the running app's taskbar button to the shortcuts, so a pinned
// shortcut and the open app share one taskbar slot. Must run before any
// window opens.
function prepareApp() {
  app.setAppUserModelId(CONFIG.APP_USER_MODEL_ID);
}

function getStartMenuShortcutPath() {
  return path.join(
    app.getPath('appData'),
    'Microsoft', 'Windows', 'Start Menu', 'Programs',
    `${CONFIG.APP_DISPLAY_NAME}.lnk`
  );
}

function getDesktopShortcutPath() {
  return path.join(app.getPath('desktop'), `${CONFIG.APP_DISPLAY_NAME}.lnk`);
}

// Writes (or overwrites) one shortcut. Returns false on failure.
function writeShortcut(shortcutPath) {
  const projectRoot = app.getAppPath();
  return shell.writeShortcutLink(shortcutPath, 'create', {
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
  });
}

module.exports = { prepareApp, getStartMenuShortcutPath, getDesktopShortcutPath, writeShortcut };
