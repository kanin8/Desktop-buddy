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
// Latest frog feet position reported by the overlay on `avatar-position`, in
// screen coordinates. Null for standalone runs and before the overlay has
// reported once, which falls back to the bottom-right anchoring below.
let frogFeet = null;
// Called when the panel's close button is used. Set by whichever app is hosting.
let onCloseRequested = null;

// Excludes the taskbar/dock so the panel never anchors under it.
function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

// Positions the panel relative to the frog when its position is known
// (Desktop-buddy): the TOP edge rests at the frog's feet (optionally a few
// pixels above them, so the feet sink into the list), and the panel grows
// DOWNWARD from there, so the frog stands fully above the list. It is
// centred horizontally under the frog and clamped to the work area. The
// height is capped so the bottom edge stays inside the work area; a longer
// list scrolls inside the panel instead. If the frog was dragged very near
// the screen bottom, the whole panel is pushed up a little so it still fits
// — the price of never letting a task list go off screen.
//
// The frog stays on top of the panel no matter what: the host app re-raises
// the avatar overlay on every panel raise ('todo-panel-raised', handled in
// main.js), because X11 window managers stack same-level always-on-top
// windows by map order and the panel is usually mapped later.
//
// Without a frog position (standalone run, overlay not yet loaded) the panel
// anchors in the bottom-right corner, as it always has, and grows upward.
function anchor() {
  if (!todoWin || todoWin.isDestroyed()) return;
  const wa = workArea();
  const wantedHeight = Math.max(
    CONFIG.MIN_HEIGHT,
    Math.min(contentHeight, wa.height - 2 * CONFIG.SCREEN_MARGIN)
  );

  if (!frogFeet) {
    todoWin.setBounds({
      x: wa.x + wa.width - CONFIG.WINDOW_WIDTH - CONFIG.SCREEN_MARGIN,
      y: wa.y + wa.height - wantedHeight - CONFIG.SCREEN_MARGIN,
      width: CONFIG.WINDOW_WIDTH,
      height: wantedHeight,
    });
    return;
  }

  const x = Math.min(
    Math.max(Math.round(frogFeet.x - CONFIG.WINDOW_WIDTH / 2), wa.x + CONFIG.SCREEN_MARGIN),
    wa.x + wa.width - CONFIG.WINDOW_WIDTH - CONFIG.SCREEN_MARGIN
  );
  const top = Math.round(frogFeet.y) - CONFIG.FOLLOW_FEET_OVERLAP;
  // Never let the panel's bottom edge leave the work area.
  const height = Math.max(
    CONFIG.MIN_HEIGHT,
    Math.min(wantedHeight, wa.y + wa.height - CONFIG.SCREEN_MARGIN - top)
  );
  todoWin.setBounds({
    x,
    y: Math.min(top, wa.y + wa.height - CONFIG.SCREEN_MARGIN - height),
    width: CONFIG.WINDOW_WIDTH,
    height,
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
    // Re-raised: the host should put the frog overlay back on top.
    ipcMain.emit('todo-panel-raised');
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

  // One level below the avatar overlay ('screen-saver'). The level ordering
  // is honoured on macOS/Windows; on X11 window managers it may not be, so
  // the host also re-raises the overlay on every raise below ('todo-panel-
  // raised'). Keeping the overlay above the panel is what lets the frog sit
  // ON the list instead of being covered by it.
  todoWin.setAlwaysOnTop(true, 'floating');
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
    // First raise: the host should put the frog overlay back on top, so the
    // frog's feet sit on the list's top edge instead of behind the panel.
    ipcMain.emit('todo-panel-raised');
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
  // focus changes. Re-assert it periodically so the panel stays put. Every
  // raise also tells the host to put the frog overlay back on top, so the
  // panel can never end up covering the frog.
  topReassertTimer = setInterval(() => {
    if (todoWin && !todoWin.isDestroyed()) {
      todoWin.setAlwaysOnTop(true, 'floating');
      ipcMain.emit('todo-panel-raised');
    }
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

// Feeds the frog's feet position from the overlay so anchor() can follow the
// frog. Sent on placement (startup, resize) and on every drag move, throttled
// in the overlay renderer so this cannot flood IPC.
ipcMain.on('avatar-position', (_event, feet) => {
  if (!feet || typeof feet !== 'object') return;
  if (typeof feet.x !== 'number' || typeof feet.y !== 'number' || !Number.isFinite(feet.x) || !Number.isFinite(feet.y)) return;
  frogFeet = { x: Math.round(feet.x), y: Math.round(feet.y) };
  // A hidden panel is re-anchored when it is shown, so only the visible one
  // needs to move now.
  if (getTodoWindow()) anchor();
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