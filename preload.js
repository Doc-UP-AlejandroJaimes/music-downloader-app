const { contextBridge, ipcRenderer } = require('electron');

// Manage single listener references to avoid leaks
let progressListener = null;
let statusListener = null;
let ytdlpStatusListener = null;

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // App
  getDownloadDir: () => ipcRenderer.invoke('app:getDownloadDir'),

  // YouTube
  getInfo: (url) => ipcRenderer.invoke('yt:getInfo', url),
  download: (url, quality) => ipcRenderer.invoke('yt:download', { url, quality }),

  // Progress listener (replaces previous listener each call)
  onProgress: (callback) => {
    if (progressListener) ipcRenderer.removeListener('yt:progress', progressListener);
    progressListener = (_event, data) => callback(data);
    ipcRenderer.on('yt:progress', progressListener);
  },

  // yt-dlp bootstrap status
  onYtDlpStatus: (callback) => {
    if (ytdlpStatusListener) ipcRenderer.removeListener('app:ytdlp-status', ytdlpStatusListener);
    ytdlpStatusListener = (_event, data) => callback(data);
    ipcRenderer.on('app:ytdlp-status', ytdlpStatusListener);
  },

  // Files
  listFiles: () => ipcRenderer.invoke('files:list'),
  moveFiles: (files, destination) => ipcRenderer.invoke('files:move', { files, destination }),
  deleteFiles: (files) => ipcRenderer.invoke('files:delete', { files }),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),

  // History
  getHistory: () => ipcRenderer.invoke('history:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
});
