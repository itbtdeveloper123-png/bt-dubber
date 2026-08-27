const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: '1.0.0',
  isElectron: true,
  openExternal: (url) => shell.openExternal(url),
  showItemInFolder: (fullPath) => ipcRenderer.invoke('show-item-in-folder', fullPath),
  
  // Auto-Updater APIs
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startDownloadUpdate: () => ipcRenderer.invoke('start-download-update'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('quit-and-install-update'),
  
  onUpdateAvailable: (callback) => {
    const sub = (_event, info) => callback(info);
    ipcRenderer.on('update-available', sub);
    return () => ipcRenderer.removeListener('update-available', sub);
  },
  onUpdateNotAvailable: (callback) => {
    const sub = (_event, info) => callback(info);
    ipcRenderer.on('update-not-available', sub);
    return () => ipcRenderer.removeListener('update-not-available', sub);
  },
  onUpdateProgress: (callback) => {
    const sub = (_event, progress) => callback(progress);
    ipcRenderer.on('update-progress', sub);
    return () => ipcRenderer.removeListener('update-progress', sub);
  },
  onUpdateDownloaded: (callback) => {
    const sub = (_event, info) => callback(info);
    ipcRenderer.on('update-downloaded', sub);
    return () => ipcRenderer.removeListener('update-downloaded', sub);
  },
  onUpdateError: (callback) => {
    const sub = (_event, err) => callback(err);
    ipcRenderer.on('update-error', sub);
    return () => ipcRenderer.removeListener('update-error', sub);
  }
});
