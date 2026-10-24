// Context bridge for the to-do list panel renderer.
//
// The panel owns no data of its own: every change is an IPC call to the
// main-process store (todoService.js), and the store pushes the authoritative
// list back on 'todo-list-changed'. It only needs two local capabilities on top
// of that: report its content height so the window can fit it, and ask to close.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('todoApp', {
  resize: (h) => ipcRenderer.send('todo-resize', h),
  close: () => ipcRenderer.send('todo-close'),

  // Task store
  getItems: () => ipcRenderer.invoke('todo-get'),
  add: (payload) => ipcRenderer.invoke('todo-add', payload),
  toggle: (id, checked) => ipcRenderer.invoke('todo-toggle', id, checked),
  toggleExpanded: (id) => ipcRenderer.invoke('todo-toggle-expanded', id),
  remove: (id) => ipcRenderer.invoke('todo-remove', id),
  clearCompleted: () => ipcRenderer.invoke('todo-clear-completed'),
  move: (id, intent) => ipcRenderer.invoke('todo-move', id, intent),
  shift: (id, direction) => ipcRenderer.invoke('todo-shift', id, direction),
  undoInsert: () => ipcRenderer.invoke('todo-undo-insert'),
  canUndo: () => ipcRenderer.invoke('todo-can-undo'),
  migrateLegacy: (legacyItems) => ipcRenderer.invoke('todo-migrate-legacy', legacyItems),
  onItemsChanged: (callback) => ipcRenderer.on('todo-list-changed', (_event, items) => callback(items)),
});