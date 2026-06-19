const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openLink: (url) => ipcRenderer.invoke('open-link', url),
  getEdgeVoices: () => ipcRenderer.invoke('get-edge-voices'),
  synthesizeEdgeTts: (params) => ipcRenderer.invoke('synthesize-edge-tts', params),
  exportTimelineMp3: (params) => ipcRenderer.invoke('export-timeline-mp3', params),
  getAudioHistory: () => ipcRenderer.invoke('get-audio-history'),
  deleteAudioFile: (filePath) => ipcRenderer.invoke('delete-audio-file', filePath),
  getAudioBase64: (filePath) => ipcRenderer.invoke('get-audio-base64', filePath),
  openFolderContaining: (filePath) => ipcRenderer.invoke('open-folder-containing', filePath),
  // Saved projects (internal MP3 library)
  saveProjectAudio: (params) => ipcRenderer.invoke('save-project-audio', params),
  onSaveProjectProgress: (callback) => ipcRenderer.on('save-project-progress', (event, data) => callback(data)),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config)
});
