const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  abrirPDF: (url) => ipcRenderer.invoke('abrir-pdf', url),
  descargarPDF: (url) => ipcRenderer.invoke('descargar-pdf', url),
  imprimirPDF: (url) => ipcRenderer.invoke('imprimir-pdf', url),
  abrirCajon: (printerName) => ipcRenderer.invoke('abrir-cajon', printerName),
  abrirCarpeta: (carpeta) => ipcRenderer.invoke('abrir-carpeta', carpeta),

  crearBackup: () => ipcRenderer.invoke('crear-backup'),
  abrirCarpetaBackups: () => ipcRenderer.invoke('abrir-carpeta-backups'),
  restaurarBackup: () => ipcRenderer.invoke('restaurar-backup'),
  reiniciarApp: () => ipcRenderer.invoke('reiniciar-app')
});