const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  abrirPDF: (url) => {
    console.log('[Electron] Enviando URL a main:', url);
    ipcRenderer.send('abrir-pdf', url);
  }
});
