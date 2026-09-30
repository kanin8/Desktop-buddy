const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('todoApp', {
  resize: (h) => ipcRenderer.send('resize', h),
  close: () => ipcRenderer.send('close'),
});
