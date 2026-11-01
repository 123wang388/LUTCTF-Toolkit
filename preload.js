/* ============================================================
   preload.js — 安全桥接层（contextIsolation）
   ============================================================ */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  min: () => ipcRenderer.send('win-min'),
  max: () => ipcRenderer.send('win-max'),
  close: () => ipcRenderer.send('win-close'),
  pin: () => ipcRenderer.invoke('win-pin'),
  version: () => ipcRenderer.invoke('app-version'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  runCmd: (cmd) => ipcRenderer.send('run-cmd', cmd),
  saveFile: (name, data) => ipcRenderer.invoke('save-file', { name, data }),
  http: (opts) => ipcRenderer.invoke('http-request', opts),
  aesCbc: (opts) => ipcRenderer.invoke('aes-cbc', opts),
  scanTool: (name) => ipcRenderer.invoke('scan-tool', name)
});
