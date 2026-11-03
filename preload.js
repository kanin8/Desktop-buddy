const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings Window API
  toggleRunning: () => ipcRenderer.send('toggle-avatar'),
  getAvatarState: () => ipcRenderer.invoke('get-avatar-state'),
  // The buddy can also be shown or hidden from the tray, the shortcut or a
  // snooze, so the main process pushes the real state after every change.
  onAvatarStateChanged: (callback) => ipcRenderer.on('avatar-state-changed', (event, state) => callback(state)),
  quitApp: () => ipcRenderer.send('quit-app'),

  // To-Do List panel API
  toggleTodoList: () => ipcRenderer.send('toggle-todolist'),
  getTodoListState: () => ipcRenderer.invoke('get-todolist-state'),
  // The panel can also be toggled from the tray menu, so the main process
  // pushes the authoritative state after every change.
  onTodoListStateChanged: (callback) => ipcRenderer.on('todolist-state-changed', (event, state) => callback(state)),

  // Overlay Window API
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

  // Hover pill and More menu (controls/controls.js).
  showSettings: () => ipcRenderer.send('show-settings'),
  showTodoList: () => ipcRenderer.send('show-todolist'),
  snooze: (choice) => ipcRenderer.send('snooze', choice),
  onOpenControls: (callback) => ipcRenderer.on('open-controls', () => callback()),
  // The buddy's proactive message (nudge/nudge.js). message is { text },
  // and text may be left out to use the default line.
  onNudge: (callback) => ipcRenderer.on('avatar-nudge', (event, message) => callback(message || {})),

  // General purpose (for the mouse-ignore logic)
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  // Gives keyboard focus back to the app the user was in.
  releaseFocus: () => ipcRenderer.send('release-focus'),

  // The main process polls the global cursor and pushes its position here.
  // This is the reliable hover signal for a click-through overlay, which cannot
  // count on forwarded DOM mousemove events.
  onCursorMove: (callback) => ipcRenderer.on('cursor-move', (event, pos) => callback(pos)),

  // Activity Detection API
  getActivity: () => ipcRenderer.invoke('activity:get-current'),
  updateActivityCategory: (id, cat) => ipcRenderer.invoke('activity:update-override', id, cat),
  onActivityUpdate: (callback) => ipcRenderer.on('activity:status-update', (event, data) => callback(data)),
});
