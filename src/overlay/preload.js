'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wisp', {
  onState: cb => ipcRenderer.on('wisp:state', (_e, m) => cb(m)),
  onSettings: cb => ipcRenderer.on('wisp:settings', (_e, s) => cb(s))
});
