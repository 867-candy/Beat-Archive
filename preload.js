const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (newPaths) => ipcRenderer.invoke('set-config', newPaths),
  updateConfig: (newConfig) => ipcRenderer.invoke('update-config', newConfig),
  selectDbPath: () => ipcRenderer.invoke('select-db-path'),
  showConfirmDialog: (message, title) => ipcRenderer.invoke('show-confirm-dialog', message, title),
  getUpdatedSongs: (date) => ipcRenderer.invoke('get-updated-songs', date),
  getClearTypeName: (clearType) => ipcRenderer.invoke('get-clear-type-name', clearType),
  getSongScore: (sha256) => ipcRenderer.invoke('get-song-score', sha256),
  loadDifficultyTable: (tableUrl) => ipcRenderer.invoke('load-difficulty-table', tableUrl)
});
