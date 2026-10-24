/**
 * Standalone entrypoint for the to-do list app.
 *
 * Lets you iterate on the panel on its own (`npm start` from this folder)
 * without launching the full Desktop-buddy avatar. The window itself lives in
 * todoWindow.js, which the Desktop-buddy host shares.
 */
const { app } = require('electron');
const { createTodoWindow } = require('./todoWindow');

// See the note in the host's main.js: without this the app aborts at startup on
// machines where Chromium cannot spawn a GPU process. Guarded because Electron
// throws if it is called once the app is ready.
if (!app.isReady()) app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-software-rasterizer');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    // Standalone has no host to stay alive for, so close means quit.
    createTodoWindow({ onClose: () => app.quit() });
  });

  app.on('window-all-closed', () => app.quit());
}