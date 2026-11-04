const { app, BrowserWindow, screen, Tray, Menu, nativeImage, ipcMain, globalShortcut, powerMonitor } = require('electron');
const path = require('path');
const http = require('http');
const { ActivityIPCHandlers } = require('./src/features/activity-detection/ipc/handlers.js');
const { IdleWatcher } = require('./src/features/activity-detection/idle/idleWatcher.js');
const {
  createTodoWindow,
  isTodoWindowVisible,
  hideTodoWindow,
} = require('./toDoList/todoWindow');
const { registerAiIpc, classifyActivity } = require('./toDoList/aiService');
const { flushStore } = require('./toDoList/todoService');
const CONFIG = require('./config');

// --- HARDWARE ACCELERATION ---
// Keep the default GPU path. Disabling hardware acceleration and the software
// rasterizer left Chromium with no renderer at all on Linux: windows opened
// but rendered nothing (blank settings window, invisible overlay). On machines
// that genuinely cannot start a GPU process, falling back to SwiftShader is
// the correct failure mode — removing the flags restores it.
//
// The Chromium sandbox also fails on some Linux systems (renderer processes
// abort on shared-memory creation with ESRCH), and Electron 44 no longer
// honors appendSwitch('no-sandbox') for it. Those launches must pass
// `--no-sandbox` on the CLI BEFORE the app path — see the "start:linux"
// script in package.json. Other platforms keep the sandbox.

// --- SINGLE INSTANCE LOCK ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, port, eventWindow, focusedWindow) => {
    if (overlayWin) {
      if (overlayWin.isMinimized()) overlayWin.restore();
      overlayWin.focus();
    }
    if (settingsWin) {
      settingsWin.show();
    }
  });
}

let overlayWin = null;
let settingsWin = null;
let tray = null;
// True once the app is really quitting, so the settings window knows to
// close for real instead of just hiding (see createSettingsWindow).
let isQuitting = false;

// --- CURSOR TRACKING ---
// The overlay is a click-through window, so it cannot rely on DOM mousemove
// events: Electron's { forward: true } mouse forwarding does not reach the page
// on every platform/window configuration. Polling screen.getCursorScreenPoint()
// is also unreliable on X11: it only reflects motion events the app connection
// has received, and a click-through fullscreen overlay receives none, so the
// value freezes after the first read.
//
// Instead, on X11 we read the pointer from a persistent `xinput test-xi2 --root`
// child, which emits a Motion event with absolute root coordinates whenever the
// pointer moves (including XTest warps). A getCursorScreenPoint() interval poll
// remains as a fallback for non-X11 sessions or if xinput is unavailable.
// Kept in one place so the whole app has exactly one global cursor reader.
let cursorPollTimer = null;
let cursorStream = null;      // ChildProcess running `xinput test-xi2 --root`.
let cursorStreamBuffer = '';  // Partial line carried between stream chunks.
// NaN marks "nothing sent yet", so the first sample always delivers a position.
// Without a guaranteed first sample the renderer would sit at its -1 sentinel
// and never reveal the hover affordance until the pointer happened to move.
let lastCursorX = NaN;
let lastCursorY = NaN;

// Pushes a cursor position to the overlay. Screen coordinates equal renderer
// client coordinates here because the overlay is a frameless window pinned to
// the top-left of the work area. Deduplicated so a still pointer causes no IPC.
function emitCursorPosition(x, y) {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  if (x === lastCursorX && y === lastCursorY) return;
  lastCursorX = x;
  lastCursorY = y;
  overlayWin.webContents.send('cursor-move', { x, y });
}

// One-shot read of the current pointer, used for the initial sync on load and
// as the fallback poll body.
function sendCursorPosition() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  const { x, y } = screen.getCursorScreenPoint();
  lastCursorX = x;
  lastCursorY = y;
  overlayWin.webContents.send('cursor-move', { x, y });
}

// Parses Motion blocks from `xinput test-xi2 --root` output. Each block has a
// line like "root: 501.18/510.42"; value 0.00/0.00 is emitted for button-only
// events and must be ignored. Returns nothing; feeds emitCursorPosition().
function consumeCursorStream(chunk) {
  cursorStreamBuffer += chunk;
  const lines = cursorStreamBuffer.split('\n');
  cursorStreamBuffer = lines.pop(); // keep any partial trailing line
  for (const line of lines) {
    const match = line.match(/^\s*root:\s*(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s*$/);
    if (!match) continue;
    const x = Math.round(parseFloat(match[1]));
    const y = Math.round(parseFloat(match[2]));
    if (x === 0 && y === 0) continue;
    emitCursorPosition(x, y);
  }
}

// Starts the live cursor stream. Falls back to an interval poll when the stream
// cannot be started. Only one source runs at a time.
function startCursorPolling() {
  if (cursorStream || cursorPollTimer) return;

  if (process.platform === 'linux' && CONFIG.XINPUT_BIN) {
    const { spawn } = require('child_process');
    try {
      // stdbuf -oL is required: xinput's stdout is fully buffered when piped,
      // so motion events would sit in the child's stdio buffer and the app
      // would never see them (hover would silently die).
      cursorStream = spawn('stdbuf', ['-oL', CONFIG.XINPUT_BIN, 'test-xi2', '--root'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      cursorStream = null;
    }
    if (cursorStream) {
      cursorStream.on('error', () => { cursorStream = null; startFallbackPoll(); });
      cursorStream.on('exit', () => { cursorStream = null; startFallbackPoll(); });
      cursorStream.stdout.setEncoding('utf8');
      cursorStream.stdout.on('data', consumeCursorStream);
      return;
    }
  }

  startFallbackPoll();
}

// Interval-based cursor reader used off X11 or when the xinput stream is not
// available. ~60 Hz keeps the affordance attached to the pointer without
// busy-waiting.
function startFallbackPoll() {
  if (cursorPollTimer) return;
  cursorPollTimer = setInterval(() => {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    const { x, y } = screen.getCursorScreenPoint();
    emitCursorPosition(x, y);
  }, CONFIG.CURSOR_POLL_MS);
}

function stopCursorPolling() {
  if (cursorPollTimer) {
    clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }
  if (cursorStream) {
    cursorStream.removeAllListeners();
    cursorStream.stdout.removeAllListeners();
    cursorStream.kill();
    cursorStream = null;
  }
  cursorStreamBuffer = '';
}

function createOverlayWindow() {

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  overlayWin = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    // macOS: a panel can take keyboard focus (the chat input, the shortcut)
    // without making the buddy the active app, so the app the user was in
    // keeps its menu bar and Copy/Paste. Other platforms ignore this.
    type: process.platform === 'darwin' ? 'panel' : undefined,
    // The window is see-through and covers the whole screen, so the macOS
    // window shadow would trace the frog and pill as a grey outline. Panels
    // get their soft shadow from CSS (--surface-shadow) instead.
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.loadFile('overlay.html');
  // Inactive, so starting the buddy doesn't take the keyboard from the app
  // the user is typing in.
  overlayWin.showInactive();

  // Push cursor positions to the overlay so the hover affordance works without
  // depending on forwarded DOM mouse events.
  startCursorPolling();

  // The renderer attaches its listener while loading, which can be after the
  // first poll. Send the current position once it is ready so the overlay never
  // starts blind.
  overlayWin.webContents.on('did-finish-load', sendCursorPosition);

  overlayWin.on('closed', () => {
    overlayWin = null;
    stopCursorPolling();
  });
}

function createSettingsWindow() {
  settingsWin = new BrowserWindow({
    width: 360,
    // Measured as the page area (not counting the title bar), so the page
    // fits without scrolling while AI is off. AI's fields scroll.
    height: 660,
    useContentSize: true,
    resizable: false,
    skipTaskbar: false,
    // Shown before the page paints, so it can't read the CSS theme yet: the
    // same grey as --grey-900 in styles/tokens.css. Update both together.
    backgroundColor: '#1c1c1e',
    // Hidden at launch so it doesn't pop up every start; opened from the tray.
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWin.loadFile('settings.html');

  // Closing the settings window only hides it, so it can be reopened.
  // While the app is quitting it must close for real; otherwise blocking
  // the close also cancels the quit and leaves the app running unseen.
  settingsWin.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    settingsWin.hide();
  });
}

function createActivityWindow() {
  let activityWin = new BrowserWindow({
    width: 500,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  activityWin.loadFile(path.join(__dirname, 'src/features/activity-detection/ui/activity.html'));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(icon);

  const updateMenu = () => {
    const isRunning = overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible();
    const todoRunning = isTodoWindowVisible();
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show Settings', click: () => settingsWin.show() },
      { label: 'Show Activity', click: () => createActivityWindow() },
      { type: 'separator' },
      {
        label: isRunning ? 'Stop Avatar' : 'Start Avatar',
        click: () => {
          ipcMain.emit('toggle-avatar');
        }
      },
      {
        label: todoRunning ? 'Hide To-Do List' : 'Show To-Do List',
        click: () => {
          ipcMain.emit('toggle-todolist');
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setContextMenu(contextMenu);
    tray.setToolTip(`Avatar: ${isRunning ? 'Running' : 'Stopped'} | To-Do List: ${todoRunning ? 'On' : 'Off'}`);
  };

  tray.on('click', () => {
    settingsWin.isVisible() ? settingsWin.hide() : settingsWin.show();
  });

  // Update menu whenever state changes
  ipcMain.on('avatar-state-changed', updateMenu);
  ipcMain.on('todolist-state-changed', updateMenu);
  updateMenu();
}

function triggerBedtime() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('avatar-speak', "It's late! You should head to bed.");
    overlayWin.webContents.send('set-screen-grayscale', true);
  }
}

// Shows the buddy's default nudge, the level 1 "still there?" check-in. Sent
// by the idle watcher and by --test-nudge. With no text the overlay uses the
// default line from nudge/config.js. Skipped while the buddy is hidden or
// snoozed, so an old nudge isn't waiting when it comes back.
function sendDefaultNudge() {
  if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) {
    overlayWin.webContents.send('avatar-nudge', {});
  }
}

// Bedtime check every minute
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 22 && now.getMinutes() === 0) {
    triggerBedtime();
  }
}, CONFIG.BEDTIME_CHECK_MS);

// Let check_spelling.py push text into the avatar's speech bubble.
//
// Two things this must get right, because both used to break startup:
//  1. It is only started when we own the single-instance lock. Without this a
//     second launch still ran this module top to bottom and raced the first
//     instance for the port.
//  2. It has an 'error' handler. Without one, a bind failure surfaces as an
//     uncaught 'EADDRINUSE' exception that aborts the whole main process.
//
// The helper is auxiliary, so failing to bind only costs the spell-checker.
//
// The port defaults to CONFIG.SPELLING_SERVER_PORT (5000). On macOS, AirPlay
// Receiver already uses 5000, so Mac users can pick another port with an
// environment variable, e.g.
//   SPELLING_SERVER_PORT=5001 npm start
// (or add `export SPELLING_SERVER_PORT=5001` to ~/.zshrc). check_spelling.py
// reads the same variable, so both sides always agree.

// Returns the port from SPELLING_SERVER_PORT, or the configured default if it
// is missing or not a valid port number.
function getSpellingServerPort() {
  const port = Number(process.env.SPELLING_SERVER_PORT);
  const isValidPort = Number.isInteger(port) && port > 0 && port < 65536;
  return isValidPort ? port : CONFIG.SPELLING_SERVER_PORT;
}

const spellingServerPort = getSpellingServerPort();

const spellingServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/speak') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const text = data.text;
        if (overlayWin && !overlayWin.isDestroyed()) {
          overlayWin.webContents.send('avatar-speak', text);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid JSON');
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

if (gotTheLock) {
  spellingServer.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(
        `Spelling helper not started: port ${spellingServerPort} is already in use ` +
        '(another copy of the app may already be running, or on macOS AirPlay Receiver). ' +
        'Set SPELLING_SERVER_PORT to another port, e.g. 5001. Everything else still works.'
      );
    } else {
      console.warn('Spelling helper failed to start:', err && err.message);
    }
  });

  spellingServer.listen(spellingServerPort, CONFIG.SPELLING_SERVER_HOST, () => {
    console.log(`Spelling server listening on port ${spellingServerPort}`);
  });
}

// IPC Handlers
// 'running' while the buddy is on screen, 'stopped' when hidden or snoozed.
function getAvatarState() {
  return (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) ? 'running' : 'stopped';
}

ipcMain.handle('get-avatar-state', getAvatarState);

// Pushes the buddy's state to Settings so its switch stays right when the
// buddy was shown or hidden from the tray, the shortcut or a snooze.
function broadcastAvatarState() {
  if (!settingsWin || settingsWin.isDestroyed()) return;
  settingsWin.webContents.send('avatar-state-changed', getAvatarState());
}

ipcMain.on('avatar-state-changed', broadcastAvatarState);

// The Quit button in Settings: the same full quit as the tray's Quit.
ipcMain.on('quit-app', () => app.quit());

// --- SNOOZE ---
// "Snooze" in the buddy's More menu hides it for a while. Only one snooze runs
// at a time, and bringing the buddy back any other way (tray, shortcut)
// cancels it.
let snoozeTimer = null;

// Milliseconds until the chosen snooze ends, or undefined for an unknown
// choice. 'tomorrow' means the next day at CONFIG.SNOOZE_TOMORROW_HOUR.
function getSnoozeDurationMs(choice, now = new Date()) {
  if (choice === 'tomorrow') {
    const wakeAt = new Date(now);
    wakeAt.setDate(wakeAt.getDate() + 1);
    wakeAt.setHours(CONFIG.SNOOZE_TOMORROW_HOUR, 0, 0, 0);
    return wakeAt - now;
  }
  return CONFIG.SNOOZE_DURATIONS_MS[choice];
}

function cancelSnooze() {
  if (snoozeTimer) {
    clearTimeout(snoozeTimer);
    snoozeTimer = null;
  }
}

// Ends a snooze. showInactive() so the buddy reappearing never steals focus
// from whatever the user is typing in.
function wakeFromSnooze() {
  snoozeTimer = null;
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.showInactive();
  ipcMain.emit('avatar-state-changed');
}

ipcMain.on('snooze', (event, choice) => {
  const durationMs = getSnoozeDurationMs(choice);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  if (!overlayWin || overlayWin.isDestroyed()) return;

  cancelSnooze();
  overlayWin.hide();
  snoozeTimer = setTimeout(wakeFromSnooze, durationMs);
  ipcMain.emit('avatar-state-changed');
});

// --- MORE MENU ACTIONS ---
ipcMain.on('show-settings', () => {
  if (!settingsWin || settingsWin.isDestroyed()) return;
  settingsWin.show();
  settingsWin.focus();
});

// Opens the to-do panel, but never closes it: unlike the tray's toggle, the
// menu item always means "show me my to-do list".
ipcMain.on('show-todolist', () => {
  if (isTodoWindowVisible()) return;
  createTodoWindow({ onClose: closeTodoPanel });
  ipcMain.emit('todolist-state-changed');
});

// --- CONTROLS SHORTCUT ---
// The overlay is click-through and never has focus, so a global shortcut is
// the keyboard way in. It wakes a snoozed buddy (the user stays in control),
// focuses the overlay and asks it to open the controls.
function openControlsFromShortcut() {
  if (!overlayWin || overlayWin.isDestroyed()) return;

  cancelSnooze();
  if (!overlayWin.isVisible()) {
    overlayWin.show();
    ipcMain.emit('avatar-state-changed');
  }
  overlayWin.setIgnoreMouseEvents(false);
  overlayWin.focus();
  overlayWin.webContents.send('open-controls');
}

// Registration fails when another app already owns the shortcut. Hover still
// works then, so this only warns.
function registerControlsShortcut() {
  const isRegistered = globalShortcut.register(CONFIG.CONTROLS_SHORTCUT, openControlsFromShortcut);
  if (!isRegistered) {
    console.warn(`Controls shortcut ${CONFIG.CONTROLS_SHORTCUT} is taken by another app; hover the buddy instead.`);
  }
}

ipcMain.on('toggle-avatar', () => {
  // Showing or hiding the buddy by hand overrides any snooze in progress.
  cancelSnooze();

  if (!overlayWin) {
    createOverlayWindow();
  } else {
    if (!overlayWin.isDestroyed() && overlayWin.isVisible()) {
      overlayWin.hide();
    } else {
      overlayWin.showInactive();
    }
  }

  ipcMain.emit('avatar-state-changed');
});

ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

// Sent when the pill, menu and chat have all closed: the overlay stops
// holding keyboard focus, so typing goes back to the app the user was in.
ipcMain.on('release-focus', () => {
  if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isFocused()) {
    overlayWin.blur();
  }
});

// --- TO-DO LIST PANEL ---
// The panel is optional and off until the user enables it in Settings. Closing
// it hides rather than destroys, so toggling back on is instant and the task
// list in the main-process store is untouched.
ipcMain.handle('get-todolist-state', () => (isTodoWindowVisible() ? 'running' : 'stopped'));

// Handles the panel's own close button. Hides the panel instead of closing it,
// then announces the new state — without the announce, the tray menu and the
// Settings checkbox would still show the panel as on.
function closeTodoPanel() {
  hideTodoWindow();
  ipcMain.emit('todolist-state-changed');
}

ipcMain.on('toggle-todolist', () => {
  if (isTodoWindowVisible()) {
    closeTodoPanel();
  } else {
    // Closing the panel must not take the avatar down with it.
    createTodoWindow({ onClose: closeTodoPanel });
  }
  ipcMain.emit('todolist-state-changed');
});

// Pushes the authoritative panel state to Settings so its checkbox reflects
// reality even when the panel was toggled from the tray menu instead.
function broadcastTodoState() {
  if (!settingsWin || settingsWin.isDestroyed()) return;
  settingsWin.webContents.send('todolist-state-changed', isTodoWindowVisible() ? 'running' : 'stopped');
}

ipcMain.on('todolist-state-changed', broadcastTodoState);

// --- AI ---
// Requests run in the main process so the API key never reaches a renderer.
// The overlay chat uses these channels; activity detection calls
// classifyActivity directly (see app.whenReady below).
registerAiIpc();

// A debounced task write could still be pending when the app quits.
app.on('before-quit', flushStore);

app.whenReady().then(() => {
  console.log('Electron is ready');
  console.log('nativeImage:', nativeImage);
  createSettingsWindow();
  createTray();


  // Start the avatar by default
  createOverlayWindow();
  registerControlsShortcut();

  // Initialize Activity Detection. Unknown apps are classified by the same AI
  // backend the chat uses, configured in Settings.
  const activityHandlers = new ActivityIPCHandlers({ aiClassify: classifyActivity });
  activityHandlers.init();

  // Idle check-in: nudge after a stretch with no keyboard or mouse input.
  // powerMonitor is the cross-platform source; the watcher only sees a number.
  const idleWatcher = new IdleWatcher({
    getIdleSeconds: () => powerMonitor.getSystemIdleTime(),
    onIdle: sendDefaultNudge,
    thresholdMs: CONFIG.IDLE_CHECK_IN_AFTER_MS,
    pollMs: CONFIG.IDLE_POLL_MS,
  });
  idleWatcher.start();

  // The to-do list panel is opt-in, so it is deliberately not created here.
  // Enable it from Settings or the tray menu.

  // Test bedtime trigger
  if (process.argv.includes('--test-bedtime')) {
    console.log('Test mode: triggering bedtime...');
    setTimeout(triggerBedtime, 2000); // Give window time to load
  }

  // Test nudge trigger: the same message the idle check-in sends.
  if (process.argv.includes('--test-nudge')) {
    console.log('Test mode: sending a nudge...');
    setTimeout(sendDefaultNudge, 2000); // Give window time to load
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Global shortcuts outlive the app on some systems unless released.
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
