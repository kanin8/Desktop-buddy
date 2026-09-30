// Context bridge for the to-do list panel renderer.
// The panel only needs two capabilities: tell the host its content height so the
// window can fit it, and ask the host to close. Channel names are namespaced
// with `todo-` so they cannot collide with the Desktop-buddy host's channels
// when both run in the same process.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('todoApp', {
  resize: (h) => ipcRenderer.send('todo-resize', h),
  close: () => ipcRenderer.send('todo-close'),
});