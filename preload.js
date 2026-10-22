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

  // AI task breakdown. The overlay never holds an API key: it asks the main
  // process to run the request and receives the reply as stream events.
  askAI: (text) => ipcRenderer.invoke('ai-ask', text),
  cancelAI: () => ipcRenderer.invoke('ai-cancel'),
  onAIStream: (callback) => ipcRenderer.on('ai-stream', (event, token) => callback(token)),
  onAIStreamEnd: (callback) => ipcRenderer.on('ai-stream-end', (event, reply) => callback(reply)),
  onAIError: (callback) => ipcRenderer.on('ai-error', (event, message) => callback(message)),
  onAITasksAdded: (callback) => ipcRenderer.on('ai-tasks-added', (event, info) => callback(info)),
  onAITasksFailed: (callback) => ipcRenderer.on('ai-tasks-failed', (event, message) => callback(message)),
  getAISettings: () => ipcRenderer.invoke('ai-get-settings'),
  setAISettings: (patch) => ipcRenderer.invoke('ai-set-settings', patch),

  // General purpose (for the mouse-ignore logic)
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),

  // The main process polls the global cursor and pushes its position here.
  // This is the reliable hover signal for a click-through overlay, which cannot
  // count on forwarded DOM mousemove events.
  onCursorMove: (callback) => ipcRenderer.on('cursor-move', (event, pos) => callback(pos)),
});
