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
const { getWindowBackgroundColor } = require('../appearance/appearanceService');

// The live panel window, or null when it has been closed.
let todoWin = null;
// Handle for the always-on-top re-assert timer, cleared when the panel closes.
let topReassertTimer = null;
// Height reported by the renderer on the last `todo-resize` message.
let contentHeight = CONFIG.DEFAULT_HEIGHT;
// Latest frog feet position reported by the overlay on `avatar-position`, in
// screen coordinates. `clearance` is the height of the hover pill's slot
// under the feet, which the pill (unlike the feet) always hangs into; it is
// measured in the overlay (see controls.css) and kept with every position.
// Null for standalone runs and before the overlay has reported once, which
// falls back to the bottom-right anchoring below.
let frogFeet = null;
// Baseline for the rigid ride during a drag: the frog's feet and the panel's
// bounds as they stood on the first dragging position. Only set while a drag
// is in flight and the panel is visible; cleared on the drop, when anchor()
// takes over and re-clamps everything as usual.
let dragFrom = null;
// Where the chat window ends, as the overlay reports it on `chat-extent`:
// { visible, y } with y the bottom edge of the chat's input bar (plus the
// breathing room the chat lift also uses). While the chat is open its window
// must stay whole, so the panel anchors under it — not merely under the
// pill's slot — and the two windows read as one stack (see anchor()).
// Hidden/extents without a y mean the chat is closed and the pill-slot
// anchor applies alone.
let chatExtent = { visible: false, y: Infinity };

// Called when the panel's close button is used. Set by whichever app is hosting.
let onCloseRequested = null;
// Called after the panel's placement or visibility changes, with
// { visible, x, y, width, height }. The host mirrors this to the overlay
// renderer, which lifts the chat above the panel's top edge. Standalone runs
// leave the hook unset and never emit.
let onPanelPlaced = null;
// Last emitted placement, as JSON, so equal bounds are not broadcast twice.
let lastPlacement = '';

// Excludes the taskbar/dock so the panel never anchors under it.
function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

// Positions the panel relative to the frog when its position is known
// (Desktop-buddy): the TOP edge rests on the bottom of the hover pill's slot
// under the frog's feet (see the `clearance` on frogFeet), and the panel
// grows DOWNWARD from there. The pill-menu therefore always sits above the
// list, and the frog — whose feet hold the slot's top edge — floats just
// above the list while it is open. The panel is centred horizontally under
// the frog and clamped to the work area.
//
// The panel is ALWAYS its full content height in this mode, so the entire
// expanded list is visible on screen: when there is not enough room below
// the pill's slot (the frog near the screen bottom), the panel is pushed up
// and bottom-aligned inside the work area instead of being clipped. The
// overlay's lift (chat/chatLayout.js) then slides the frog — the pill riding
// with it — up to rest on the list's top edge, so the pill-menu reads as
// standing on the list wherever it is. A list taller than the work area
// scrolls inside the panel, as ever.
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
    notifyPlacement();
    return;
  }

  const x = Math.min(
    Math.max(Math.round(frogFeet.x - CONFIG.WINDOW_WIDTH / 2), wa.x + CONFIG.SCREEN_MARGIN),
    wa.x + wa.width - CONFIG.WINDOW_WIDTH - CONFIG.SCREEN_MARGIN
  );
  // The top edge rests where the pill's slot under the feet ends: the pill
  // is what stands on the list, so the pill-menu is always above it and the
  // frog appears lifted above the list by the slot whenever the list is open.
  let top = Math.round(frogFeet.y + frogFeet.clearance) - CONFIG.FOLLOW_FEET_OVERLAP;
  // While the chat is open the pill-slot anchor may fall INSIDE the chat
  // window (the input bar hangs below the pill). The chat outranks it: the
  // panel tucks in right below the chat window's bottom edge (the overlay
  // pushes it with the same gap the chat lift keeps), and the two windows
  // read as one stack. When there is not enough room below — the chat sits
  // near the screen bottom — the clamp above the next lines pulls the panel
  // up whole and the overlay's lift raises the chat above the list, but the
  // panel never opens split behind the chat.
  if (chatExtent.visible && Number.isFinite(chatExtent.y)) {
    top = Math.max(top, chatExtent.y);
  }
  // The panel always shows its full height (the whole expanded list stays
  // visible on screen). When the feet sit too low for that, the top edge
  // gives way so the panel stays whole and inside the work area — the
  // overlay's lift closes the resulting pin-gap between pill and list.
  todoWin.setBounds({
    x,
    y: Math.max(wa.y + CONFIG.SCREEN_MARGIN, Math.min(top, wa.y + wa.height - CONFIG.SCREEN_MARGIN - wantedHeight)),
    width: CONFIG.WINDOW_WIDTH,
    height: wantedHeight,
  });
  notifyPlacement();
}

// Announces the panel's current bounds — or its absence — to the host hook,
// skipping repeats so dragging cannot flood the renderer.
function notifyPlacement() {
  if (!onPanelPlaced) return;
  let info;
  if (!todoWin || todoWin.isDestroyed() || !isTodoWindowVisible()) info = { visible: false };
  else {
    const bounds = todoWin.getBounds();
    info = {
      visible: true,
      x: bounds.x, y: bounds.y,
      width: bounds.width, height: bounds.height,
    };
  }
  const signature = JSON.stringify(info);
  if (signature === lastPlacement) return;
  lastPlacement = signature;
  onPanelPlaced(info);
}

/** Lets a host observe the panel placement; pass null to unsubscribe. */
function setPanelPlacementListener(fn) {
  onPanelPlaced = typeof fn === 'function' ? fn : null;
}

/** Lets a host feed the chat window's current bottom edge (or null to clear). */
function setChatExtentReference(extent) {
  chatExtent = extent && typeof extent === 'object' && Number.isFinite(extent.y)
    ? { visible: !!extent.visible, y: Math.max(0, Math.round(extent.y)) }
    : { visible: false, y: Infinity };
  // Refresh a visible panel that already relies on the chat's bottom edge:
  // the chat may have lifted (the list opened or moved) or closed. During a
  // rigid ride the drop's own anchor() handles it — new anchors would fight
  // the drag.
  if (!dragFrom) anchor();
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
    notifyPlacement();
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
    // panel grey of the current theme (see PANEL_BG_* in the root config.js).
    backgroundColor: getWindowBackgroundColor(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The see-through frog overlay covers the whole screen above this
      // panel, and Chromium (on Windows especially) can count the panel as
      // hidden behind it and stop drawing it. Tasks added from the chat then
      // only showed up after the panel was clicked. This keeps it drawing.
      backgroundThrottling: false,
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
    notifyPlacement();
    // First raise: the host should put the frog overlay back on top, so the
    // frog's feet sit on the list's top edge instead of behind the panel.
    ipcMain.emit('todo-panel-raised');
  });

  // Clicking the panel gives it focus, and X11 window managers (Cinnamon's
  // muffin included) restack same-level always-on-top windows on activation:
  // the panel jumps above the frog overlay until the five-second re-assert
  // timer puts the frog back. Re-raise the overlay immediately instead, so
  // the frog never disappears behind the list while the user works in it.
  // moveTop() does not take focus, so the click still lands in the panel.
  todoWin.on('focus', () => {
    ipcMain.emit('todo-panel-raised');
  });

  // Release the timer and the module-scoped reference. Without clearing the
  // interval, a destroyed window would be retained and every toggle would leak
  // one timer.
  todoWin.on('closed', () => {
    clearInterval(topReassertTimer);
    topReassertTimer = null;
    todoWin = null;
    notifyPlacement();
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
  notifyPlacement();
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
  // The pill's slot height is optional so older senders keep working; a
  // missing or bogus one anchors the panel at the bare feet again.
  const clearance =
    typeof feet.clearance === 'number' && Number.isFinite(feet.clearance)
      ? Math.max(0, Math.round(feet.clearance))
      : 0;
  frogFeet = { x: Math.round(feet.x), y: Math.round(feet.y), clearance };
  const dragging = feet.dragging === true;
  // A hidden panel is re-anchored when it is shown, so only visible ones
  // move now.
  const win = getTodoWindow();

  // While the frog is dragged, ride along rigidly: translate the panel by
  // exactly the frog's movement instead of re-anchoring, so the arrangement
  // (the pill resting on the list) keeps its shape and can be carried
  // anywhere. Wherever it is dropped, anchor() re-clamps as usual.
  if (dragging) {
    if (!win) return;
    if (!dragFrom) dragFrom = { feet: frogFeet, bounds: win.getBounds() };
    else {
      const from = dragFrom;
      win.setBounds({
        x: Math.round(from.bounds.x + frogFeet.x - from.feet.x),
        y: Math.round(from.bounds.y + frogFeet.y - from.feet.y),
        width: from.bounds.width,
        height: from.bounds.height,
      });
      notifyPlacement();
    }
    return;
  }
  if (dragFrom) dragFrom = null;
  if (win) anchor();
});

// Feeds the chat window's bottom edge (see overlay.js's pushChatExtent).
// While the chat is open, anchor() tucks the panel in right below it instead
// of only under the pill's slot, so the two windows stack one after another.
ipcMain.on('chat-extent', (_event, extent) => {
  setChatExtentReference(extent);
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
  setPanelPlacementListener,
};