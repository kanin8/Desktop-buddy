const { app, BrowserWindow, screen, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { ActivityIPCHandlers } = require('./src/features/activity-detection/ipc/handlers.js');
const {
  createTodoWindow,
  isTodoWindowVisible,
  hideTodoWindow,
} = require('./toDoList/todoWindow');
const { registerAiIpc } = require('./toDoList/aiService');
const { flushStore } = require('./toDoList/todoService');
const CONFIG = require('./config');

// --- HARDWARE ACCELERATION ---
// Must be set before the app becomes ready. On machines where Chromium cannot
// start a GPU process it aborts the whole app with
// "GPU process isn't usable. Goodbye." and SIGTRAP, so `npm start` appears to do
// nothing. This app only draws simple DOM and transparent windows, which render
// fine without the GPU, so opting out keeps startup reliable everywhere.
// --disable-gpu on its own is not enough: the software rasterizer then takes
// over and fails too, hence app.commandLine.appendSwitch as well.
// Guarded because Electron throws if this is called once the app is ready (for
// example when a test harness requires this module after app-ready).
if (!app.isReady()) app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-software-rasterizer');

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

<<<<<<< HEAD
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
      cursorStream = spawn(CONFIG.XINPUT_BIN, ['test-xi2', '--root'], {
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

=======
// --- SETTINGS PERSISTENCE ---
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading settings:', e);
  }
  // Default settings
  return {
    aiConfig: {
      endpoint: 'http://localhost:3000',
      provider: 'ollama',
      apiKey: '',
      model: 'gemma:2b'
    }
  };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Error saving settings:', e);
  }
}

const currentSettings = loadSettings();

>>>>>>> main
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.loadFile('overlay.html');
  overlayWin.show();

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
    width: 320,
    height: 520,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWin.loadFile('settings.html');

  // Prevent the app from quitting when settings window is closed
  settingsWin.on('close', (event) => {
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
        `Spelling helper not started: port ${CONFIG.SPELLING_SERVER_PORT} is already in use ` +
        '(another copy of the app may already be running). Everything else still works.'
      );
    } else {
      console.warn('Spelling helper failed to start:', err && err.message);
    }
  });

  spellingServer.listen(CONFIG.SPELLING_SERVER_PORT, CONFIG.SPELLING_SERVER_HOST, () => {
    console.log(`Spelling server listening on port ${CONFIG.SPELLING_SERVER_PORT}`);
  });
}

// IPC Handlers
ipcMain.handle('get-avatar-state', () => {
  return (overlayWin && !overlayWin.isDestroyed()) ? (overlayWin.isVisible() ? 'running' : 'stopped') : 'stopped';
});

ipcMain.handle('get-ai-config', () => {
  return currentSettings.aiConfig;
});

ipcMain.handle('save-ai-config', async (event, config) => {
  currentSettings.aiConfig = config;
  saveSettings(currentSettings);

  try {
    // Sync with AI server
    await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model
      })
    });
    console.log('[Main] AI config synced with server');
  } catch (e) {
    console.error('[Main] Failed to sync AI config with server:', e.message);
  }

  return { success: true };
});

ipcMain.on('toggle-avatar', () => {

  if (!overlayWin) {
    createOverlayWindow();
  } else {
    if (!overlayWin.isDestroyed() && overlayWin.isVisible()) {
      overlayWin.hide();
    } else {
      overlayWin.show();
    }
  }

  ipcMain.emit('avatar-state-changed');
});

ipcMain.on('set-color', (event, color) => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('update-color', color);
  }
});

ipcMain.on('set-personality', (event, name) => {
  // We need to send the actual CONFIG object from a preset to the renderer
  // But wait, the overlay.js already has the presets.
  // Let's just send the name and let overlay.js handle the lookup.
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('update-personality', name);
  }
});

ipcMain.on('set-avatar-type', (event, type) => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('update-avatar-type', type);
  }
});

ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setIgnoreMouseEvents(ignore, { forward: true });
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

// --- AI TASK BREAKDOWN ---
// Requests run in the main process so the API key never reaches a renderer.
// The overlay chat (hover the avatar, click "Ask the buddy") is the only
// consumer.
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

  // Initialize Activity Detection
  const activityHandlers = new ActivityIPCHandlers();
  activityHandlers.init();
  // The to-do list panel is opt-in, so it is deliberately not created here.
  // Enable it from Settings or the tray menu.

  // Test bedtime trigger
  if (process.argv.includes('--test-bedtime')) {
    console.log('Test mode: triggering bedtime...');
    setTimeout(triggerBedtime, 2000); // Give window time to load
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
