'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wisp', {
  get: () => ipcRenderer.invoke('wisp:get'),
  set: patch => ipcRenderer.invoke('wisp:set', patch),
  reset: () => ipcRenderer.invoke('wisp:reset'),
  open: url => ipcRenderer.invoke('wisp:open', url),
  revealData: () => ipcRenderer.invoke('wisp:reveal-data'),
  onSettings: cb => ipcRenderer.on('wisp:settings', (_e, p) => cb(p)),
  onGoto: cb => ipcRenderer.on('wisp:goto', (_e, s) => cb(s)),
  onLive: cb => ipcRenderer.on('wisp:live', (_e, m) => cb(m))
});
