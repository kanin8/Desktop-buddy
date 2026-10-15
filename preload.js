const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings Window API
  toggleRunning: () => ipcRenderer.send('toggle-avatar'),
  getAvatarState: () => ipcRenderer.invoke('get-avatar-state'),
  setColor: (color) => ipcRenderer.send('set-color', color),
  setPersonality: (name) => ipcRenderer.send('set-personality', name),
  setAvatarType: (type) => ipcRenderer.send('set-avatar-type', type),

  // To-Do List panel API
  toggleTodoList: () => ipcRenderer.send('toggle-todolist'),
  getTodoListState: () => ipcRenderer.invoke('get-todolist-state'),
  // The panel can also be toggled from the tray menu, so the main process
  // pushes the authoritative state after every change.
  onTodoListStateChanged: (callback) => ipcRenderer.on('todolist-state-changed', (event, state) => callback(state)),

  // Overlay Window API
  updateColor: (callback) => ipcRenderer.on('update-color', (event, color) => callback(color)),
  updatePersonality: (callback) => ipcRenderer.on('update-personality', (event, config) => callback(config)),
  updateAvatarType: (callback) => ipcRenderer.on('update-avatar-type', (event, type) => callback(type)),
  speak: (callback) => ipcRenderer.on('avatar-speak', (event, text) => callback(text)),
  setScreenGrayscale: (callback) => ipcRenderer.on('set-screen-grayscale', (event, enabled) => callback(enabled)),

  // General purpose (for the mouse-ignore logic)
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
});
