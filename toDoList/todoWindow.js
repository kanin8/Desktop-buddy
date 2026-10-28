/**
 * Factory for the to-do list panel window.
 *
 * Shared by both entrypoints so the panel looks and behaves identically:
 *   - toDoList/main.js  -> standalone app (`npm start` inside toDoList/)
 *   - ../main.js        -> Desktop-buddy, where the settings window toggles it
 *
 * Owns window geometry, always-on-top re-assertion, and the `todo-*` IPC
 * channels. Callers only decide what "close" means: the standalone app quits,
 * Desktop-buddy only hides the panel so the avatar keeps running.
 */
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const CONFIG = require('./config');
const { registerTodoIpc } = require('./todoService');

// The live panel window, or null when it has been closed.
let todoWin = null;
// Handle for the always-on-top re-assert timer, cleared when the panel closes.
let topReassertTimer = null;
// Height reported by the renderer on the last `todo-resize` message.
let contentHeight = CONFIG.DEFAULT_HEIGHT;
// Called when the panel's close button is used. Set by whichever app is hosting.
let onCloseRequested = null;

// Excludes the taskbar/dock so the panel never anchors under it.
function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

// Positions the panel in the bottom-right corner; grows upward as content grows.
// Clamped to the work area so a very long task list cannot push it offscreen.
function anchor() {
  if (!todoWin || todoWin.isDestroyed()) return;
  const wa = workArea();
  const h = Math.max(
    CONFIG.MIN_HEIGHT,
    Math.min(contentHeight, wa.height - 2 * CONFIG.SCREEN_MARGIN)
  );
  todoWin.setBounds({
    x: wa.x + wa.width - CONFIG.WINDOW_WIDTH - CONFIG.SCREEN_MARGIN,
    y: wa.y + wa.height - h - CONFIG.SCREEN_MARGIN,
    width: CONFIG.WINDOW_WIDTH,
    height: h,
  });
}

// Creates and shows the panel. Safe to call when the panel already exists —
// the existing window is reused and made visible so callers need not track
// state. `onClose` overrides what the panel's close button does; defaults to
// closing just the panel.
function createTodoWindow({ onClose } = {}) {
  const existing = getTodoWindow();
  if (existing) {
    if (onClose) onCloseRequested = onClose;
    // Hiding does not destroy the window, so a hidden panel still counts as
    // existing here. Re-anchoring before showing avoids a flash at stale bounds.
    anchor();
    existing.show();
    return existing;
  }

  onCloseRequested = onClose || null;
  contentHeight = CONFIG.DEFAULT_HEIGHT;

  todoWin = new BrowserWindow({
    width: CONFIG.WINDOW_WIDTH,
    height: contentHeight,
    minWidth: CONFIG.WINDOW_WIDTH,
    maxWidth: CONFIG.WINDOW_WIDTH,
    frame: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    // Shown before the page paints, so it can't read the CSS theme yet: the
    // same grey as --grey-900 in styles/tokens.css. Update both together.
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 'screen-saver' level keeps the panel above fullscreen apps and the
  // Desktop-buddy avatar overlay, which also sits at this level.
  todoWin.setAlwaysOnTop(true, 'screen-saver');
  todoWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  todoWin.setMenuBarVisibility(false);

  // Absolute path required: loadFile() resolves a relative path against the
  // process working directory, not this module's folder. Launched from the repo
  // root (the normal way to start Desktop-buddy) cwd has no index.html, the load
  // fails silently, and the panel renders as an empty box in its backgroundColor.
  // Standalone runs from inside toDoList/ where cwd happens to match, which is
  // why this only showed up once the panel moved into the host app.
  todoWin.loadFile(path.join(__dirname, 'index.html'));

  // Wait for first paint so the panel never flashes at the wrong position.
  todoWin.once('ready-to-show', () => {
    anchor();
    todoWin.show();
  });

  // Release the timer and the module-scoped reference. Without clearing the
  // interval, a destroyed window would be retained and every toggle would leak
  // one timer.
  todoWin.on('closed', () => {
    clearInterval(topReassertTimer);
    topReassertTimer = null;
    todoWin = null;
  });

  // Some window managers drop always-on-top after the window is mapped or after
  // focus changes. Re-assert it periodically so the panel stays put.
  topReassertTimer = setInterval(() => {
    if (todoWin && !todoWin.isDestroyed()) todoWin.setAlwaysOnTop(true, 'screen-saver');
  }, CONFIG.TOP_REASSERT_MS);

  return todoWin;
}

// Returns the panel window only if it currently exists and is visible.
function getTodoWindow() {
  return todoWin && !todoWin.isDestroyed() ? todoWin : null;
}

function isTodoWindowVisible() {
  const win = getTodoWindow();
  return !!win && win.isVisible();
}

function hideTodoWindow() {
  const win = getTodoWindow();
  if (win) win.hide();
}

// Closes the panel outright (used when the host app itself is shutting down).
function destroyTodoWindow() {
  const win = getTodoWindow();
  if (win) win.close();
}

/* --- IPC wiring ---
 * Registered once at module load rather than per-window, so toggling the panel
 * on and off cannot stack duplicate listeners on ipcMain.
 */
ipcMain.on('todo-resize', (_event, h) => {
  if (typeof h !== 'number' || !Number.isFinite(h)) return;
  contentHeight = Math.ceil(h);
  anchor();
});

ipcMain.on('todo-close', () => {
  if (onCloseRequested) onCloseRequested();
  else destroyTodoWindow();
});

// The task CRUD channels live here rather than in the app entrypoints, so the
// standalone app and the Desktop-buddy host get identical behaviour.
registerTodoIpc();

// Re-anchor on resolution or monitor changes so the panel follows the work area.
// Uses the live contentHeight, so no per-window closure is needed here.
//
// Deferred until app-ready because this module is imported at the top of the
// host's main.js, i.e. before Electron emits 'ready'. Touching `screen` any
// earlier throws "The 'screen' module can't be used before the app 'ready'
// event", which takes down the whole app on startup.
app.whenReady().then(() => {
  screen.on('display-metrics-changed', anchor);
  screen.on('display-added', anchor);
  screen.on('display-removed', anchor);
});

module.exports = {
  createTodoWindow,
  getTodoWindow,
  isTodoWindowVisible,
  hideTodoWindow,
  destroyTodoWindow,
};