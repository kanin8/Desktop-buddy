const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings Window API
  toggleRunning: () => ipcRenderer.send('toggle-avatar'),
  getAvatarState: () => ipcRenderer.invoke('get-avatar-state'),

  // To-Do List panel API
  toggleTodoList: () => ipcRenderer.send('toggle-todolist'),
  getTodoListState: () => ipcRenderer.invoke('get-todolist-state'),

  // Overlay Window API
  speak: (callback) => ipcRenderer.on('avatar-speak', (event, text) => callback(text)),
  setScreenGrayscale: (callback) => ipcRenderer.on('set-screen-grayscale', (event, enabled) => callback(enabled)),

  // General purpose (for the mouse-ignore logic)
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
});
