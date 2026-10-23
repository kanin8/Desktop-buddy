const { app, BrowserWindow, screen, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const {
  createTodoWindow,
  isTodoWindowVisible,
  hideTodoWindow,
} = require('./toDoList/todoWindow');

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

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(icon);

  const updateMenu = () => {
    const isRunning = overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible();
    const todoRunning = isTodoWindowVisible();
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show Settings', click: () => settingsWin.show() },
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
}, 60000);

// --- SPELLING SERVER ---
// check_spelling.py sends messages here for the avatar to say.
// The port defaults to 5000. On macOS, AirPlay Receiver already uses 5000,
// so Mac users can pick another port with an environment variable, e.g.
//   SPELLING_SERVER_PORT=5001 npm start
// (or add `export SPELLING_SERVER_PORT=5001` to ~/.zshrc). check_spelling.py
// reads the same variable, so both sides always agree.
const DEFAULT_SPELLING_SERVER_PORT = 5000;

// Returns the port from SPELLING_SERVER_PORT, or the default if it is
// missing or not a valid port number.
function getSpellingServerPort() {
  const port = Number(process.env.SPELLING_SERVER_PORT);
  const isValidPort = Number.isInteger(port) && port > 0 && port < 65536;
  return isValidPort ? port : DEFAULT_SPELLING_SERVER_PORT;
}

const spellingServerPort = getSpellingServerPort();

const server = http.createServer((req, res) => {
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

// Without this handler, a taken port crashes the whole app. Logging instead
// keeps the avatar running; only spelling messages are unavailable.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Spelling server: port ${spellingServerPort} is already in use ` +
      '(on macOS this is often AirPlay Receiver). ' +
      'Set SPELLING_SERVER_PORT to another port, e.g. 5001.'
    );
  } else {
    console.error('Spelling server error:', err);
  }
});

server.listen(spellingServerPort, '127.0.0.1', () => {
  console.log(`Spelling server listening on port ${spellingServerPort}`);
});

// IPC Handlers
ipcMain.handle('get-avatar-state', () => {
  return (overlayWin && !overlayWin.isDestroyed()) ? (overlayWin.isVisible() ? 'running' : 'stopped') : 'stopped';
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
// list in localStorage is untouched.
ipcMain.handle('get-todolist-state', () => (isTodoWindowVisible() ? 'running' : 'stopped'));

ipcMain.on('toggle-todolist', () => {
  if (isTodoWindowVisible()) {
    hideTodoWindow();
  } else {
    // Closing the panel must not take the avatar down with it.
    createTodoWindow({ onClose: hideTodoWindow });
  }
  ipcMain.emit('todolist-state-changed');
});

app.whenReady().then(() => {
  console.log('Electron is ready');
  console.log('nativeImage:', nativeImage);
  createSettingsWindow();
  createTray();


  // Start the avatar by default
  createOverlayWindow();

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
