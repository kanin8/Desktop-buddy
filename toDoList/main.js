/**
 * Standalone entrypoint for the to-do list app.
 *
 * Lets you iterate on the panel on its own (`npm start` from this folder)
 * without launching the full Desktop-buddy avatar. The window itself lives in
 * todoWindow.js, which the Desktop-buddy host shares.
 */
const { app } = require('electron');
const { createTodoWindow } = require('./todoWindow');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    // Standalone has no host to stay alive for, so close means quit.
    createTodoWindow({ onClose: () => app.quit() });
  });

  app.on('window-all-closed', () => app.quit());
}