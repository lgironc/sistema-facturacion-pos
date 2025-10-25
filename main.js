const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');

console.log('✅ main.js cargado correctamente');

ipcMain.handle('abrir-pdf', async (event, url) => {
  console.log('📌 Listener IPC recibido en main. URL:', url);

  try {
    // ✅ 1. Si ya es una ruta local existente, abrimos directamente
    if (fs.existsSync(url)) {
      console.log('📄 Abriendo PDF local:', url);
      const result = await shell.openPath(url);
      return { success: !result, path: url, error: result || null };
    }

    // ✅ 2. Si es una URL relativa tipo /facturas/27/pdf → convertir a HTTP
    if (!url.startsWith('http')) {
      url = `http://localhost:4000${url}`;
      console.log('🌐 URL convertida a absoluta:', url);
    }

    console.log('[MAIN] Descargando PDF desde:', url);

    // ✅ 3. Extraemos ID de factura para nombrar el archivo
    const match = url.match(/\/facturas\/(\d+)\/pdf/);
    let facturaId = match ? match[1] : Date.now();
    const numeroFactura = `INT-${String(facturaId).padStart(4, '0')}`;

    // ✅ 4. Crear carpeta en Documentos/FacturasPOS
    const folderPath = path.join(app.getPath('documents'), 'FacturasPOS');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log('📂 Carpeta creada:', folderPath);
    }

    // ✅ 5. Ruta final del archivo PDF descargado
    const filePath = path.join(folderPath, `Factura_${numeroFactura}.pdf`);
    const client = url.startsWith('https') ? https : http;

    await new Promise((resolve, reject) => {
      client.get(url, (response) => {
        if (response.statusCode !== 200) {
          return reject(`Error al descargar PDF: ${response.statusCode}`);
        }

        const fileStream = fs.createWriteStream(filePath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`✅ PDF guardado como: ${filePath}`);
          resolve();
        });

      }).on('error', reject);
    });

    // ✅ 6. Abrir el PDF descargado
    const result = await shell.openPath(filePath);
    return { success: !result, path: filePath, error: result || null };

  } catch (error) {
    console.error('❌ Error general en descarga/abrir PDF:', error);
    return { success: false, error };
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
