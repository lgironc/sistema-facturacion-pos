const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');

console.log('✅ main.js cargado correctamente');

// ✅ Listener IPC para descargar y abrir el PDF
ipcMain.on('abrir-pdf', async (event, url) => {
  console.log(' Listener IPC recibido en main. URL:', url);

  try {
    // Asegurar URL absoluta
    if (!url.startsWith('http')) {
      url = `http://localhost:4000${url}`;
    }

    console.log('[MAIN] Descargando PDF desde:', url);

    // Extraer ID de factura (/facturas/27/pdf → "27")
    const match = url.match(/\/facturas\/(\d+)\/pdf/);
    let facturaId = match ? match[1] : Date.now();
    const numeroFactura = `INT-${String(facturaId).padStart(4, '0')}`;

    // 📂 Crear carpeta en Documentos/FacturasPOS
    const folderPath = path.join(app.getPath('documents'), 'FacturasPOS');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log('Carpeta creada:', folderPath);
    }

    // Ruta final del PDF guardado
    const filePath = path.join(folderPath, `Factura_${numeroFactura}.pdf`);

    const client = url.startsWith('https') ? https : http;

    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        console.error(` Error al descargar PDF: ${response.statusCode}`);
        return;
      }

      const fileStream = fs.createWriteStream(filePath);

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(` PDF guardado como: ${filePath}`);

        // ✅ Abrir archivo guardado
        shell.openPath(filePath);


      });
    }).on('error', (err) => {
      console.error(' Error en la descarga:', err);
    });

  } catch (error) {
    console.error(' Error general en descarga/abrir PDF:', error);
  }
});

let backendProcess;
let win;

function iniciarBackend() {
  console.log('🚀 Iniciando backend...');
  backendProcess = spawn('node', ['index.js'], { shell: true });

  backendProcess.stdout.on('data', (data) => console.log(`📦 BACKEND: ${data}`));
  backendProcess.stderr.on('data', (data) => console.error(`❌ BACKEND ERROR: ${data}`));
}

function crearVentana() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadURL('http://localhost:4000/pos');
}

app.whenReady().then(() => {
  iniciarBackend();
  setTimeout(crearVentana, 2000); // Esperar a que el backend levante
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  app.quit();
});
