'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wispSaver', {
  exit: () => ipcRenderer.send('wisp:saver-exit'),
  onScene: cb => ipcRenderer.on('wisp:saver-scene', (_e, n) => cb(n))
});
