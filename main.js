const { app, BrowserWindow, screen, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

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
    height: 420,
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
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show Settings', click: () => settingsWin.show() },
      { type: 'separator' },
      {
        label: isRunning ? 'Stop Avatar' : 'Start Avatar',
        click: () => {
          ipcMain.emit('toggle-avatar');
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setContextMenu(contextMenu);
    tray.setToolTip(`Avatar: ${isRunning ? 'Running' : 'Stopped'}`);
  };

  tray.on('click', () => {
    settingsWin.isVisible() ? settingsWin.hide() : settingsWin.show();
  });

  // Update menu whenever state changes
  ipcMain.on('avatar-state-changed', updateMenu);
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

server.listen(5000, '127.0.0.1');
console.log('Spelling server listening on port 5000');

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

ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

app.whenReady().then(() => {
  console.log('Electron is ready');
  console.log('nativeImage:', nativeImage);
  createSettingsWindow();
  createTray();


  // Start the avatar by default
  createOverlayWindow();

  // Test bedtime trigger
  if (process.argv.includes('--test-bedtime')) {
    console.log('Test mode: triggering bedtime...');
    setTimeout(triggerBedtime, 2000); // Give window time to load
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
