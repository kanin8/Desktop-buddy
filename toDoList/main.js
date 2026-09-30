const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const WIDTH = 320;
const MARGIN = 16;          // gap from the screen edges
const MIN_HEIGHT = 60;

let win = null;
let height = 120;

function workArea() {
  return screen.getPrimaryDisplay().workArea;   // excludes taskbar/dock
}

// Pin the window to the bottom-right corner; it grows upward.
function anchor() {
  if (!win) return;
  const wa = workArea();
  const h = Math.max(MIN_HEIGHT, Math.min(height, wa.height - 2 * MARGIN));
  win.setBounds({
    x: wa.x + wa.width - WIDTH - MARGIN,
    y: wa.y + wa.height - h - MARGIN,
    width: WIDTH,
    height: h,
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH,
    height,
    minWidth: WIDTH,
    maxWidth: WIDTH,
    frame: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    backgroundColor: '#16232f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');                        // above everything
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenuBarVisibility(false);
  win.loadFile('index.html');
  win.once('ready-to-show', () => { anchor(); win.show(); });
  win.on('closed', () => { win = null; });
}

// The page reports its content height so the window can fit it.
ipcMain.on('resize', (_e, h) => {
  if (typeof h !== 'number' || !Number.isFinite(h)) return;
  height = Math.ceil(h);
  anchor();
});
ipcMain.on('close', () => app.quit());

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    createWindow();
    screen.on('display-metrics-changed', anchor);
    screen.on('display-added', anchor);
    screen.on('display-removed', anchor);
    // Re-assert stacking order now and then; some window managers drop it.
    setInterval(() => { if (win) win.setAlwaysOnTop(true, 'screen-saver'); }, 5000);
  });
  app.on('window-all-closed', () => app.quit());
}
