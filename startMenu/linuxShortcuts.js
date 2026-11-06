// Linux side of the app shortcuts: freedesktop .desktop launchers in the
// applications folder (which desktop app search lists) and on the desktop.

const { app } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CONFIG = require('../config');

// Nothing to set up before windows open on Linux.
function prepareApp() {}

// "Desktop Buddy" -> "desktop-buddy.desktop", the usual launcher file name.
function getLauncherFileName() {
  return `${CONFIG.APP_DISPLAY_NAME.toLowerCase().replace(/\s+/g, '-')}.desktop`;
}

function getStartMenuShortcutPath() {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(dataHome, 'applications', getLauncherFileName());
}

function getDesktopShortcutPath() {
  return path.join(app.getPath('desktop'), getLauncherFileName());
}

// Quotes one argument for a launcher's Exec line. The spec wants characters
// that are special inside quotes escaped with a backslash, then every
// backslash doubled again because Exec is also a desktop-entry string, and
// % written as %% so it isn't read as a field code like %f.
function quoteExecArgument(argument) {
  const quoted = `"${argument.replace(/(["`$\\])/g, '\\$1')}"`;
  return quoted.replace(/\\/g, '\\\\').replace(/%/g, '%%');
}

// Builds the launcher file's text. Pure, so it can be unit tested.
// --no-sandbox comes before the app path because Electron's sandbox crashes
// the renderers on some Linux systems and only the CLI flag turns it off (see
// "start:linux" in package.json). A packaged build needs no app path.
function buildDesktopEntry({ electronPath, projectRoot, isPackaged, iconPath, wmClass }) {
  const execParts = [quoteExecArgument(electronPath), '--no-sandbox'];
  if (!isPackaged) execParts.push(quoteExecArgument(projectRoot));

  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${CONFIG.APP_DISPLAY_NAME}`,
    `Comment=${CONFIG.APP_DESCRIPTION}`,
    `Exec=${execParts.join(' ')}`,
    `Path=${projectRoot}`,
    `Icon=${iconPath}`,
    'Terminal=false',
    'Categories=Utility;',
    // Lets docks match the open window to this launcher.
    `StartupWMClass=${wmClass}`,
    '',
  ].join('\n');
}

// GNOME's desktop icons refuse to launch a .desktop file until it is marked
// trusted (the "Allow Launching" menu item). Best effort: gio is missing on
// some desktops, and those don't need the flag anyway.
function markLauncherTrusted(shortcutPath) {
  execFile('gio', ['set', shortcutPath, 'metadata::trusted', 'true'], () => {});
}

// Writes the launcher, but only when its text changed, so an unchanged file
// keeps its trusted flag. Returns false on failure.
function writeShortcut(shortcutPath) {
  const projectRoot = app.getAppPath();
  const contents = buildDesktopEntry({
    electronPath: process.execPath,
    projectRoot,
    isPackaged: app.isPackaged,
    iconPath: path.join(projectRoot, 'icon.png'),
    wmClass: app.getName(),
  });

  try {
    const existing = fs.existsSync(shortcutPath) ? fs.readFileSync(shortcutPath, 'utf8') : null;
    if (existing === contents) return true;

    fs.mkdirSync(path.dirname(shortcutPath), { recursive: true });
    fs.writeFileSync(shortcutPath, contents);
    // Desktop icons only launch executable .desktop files.
    fs.chmodSync(shortcutPath, 0o755);
    markLauncherTrusted(shortcutPath);
    return true;
  } catch (error) {
    console.warn('Could not write launcher:', error.message);
    return false;
  }
}

module.exports = {
  prepareApp,
  getStartMenuShortcutPath,
  getDesktopShortcutPath,
  writeShortcut,
  buildDesktopEntry,
};
