const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  abrirPDF: (url) => ipcRenderer.invoke('abrir-pdf', url)
});
