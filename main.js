const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');

console.log('✅ main.js cargado correctamente');

let backendProcess;
let win;

// ==============================
// 🔹 Helpers para manejo de PDF
// ==============================

// Carpeta donde se guardarán las facturas (dentro del proyecto)
function getFacturasFolder() {
  // 📌 Carpeta "facturasPDF" dentro del proyecto actual
  const folderPath = path.join(__dirname, 'facturasPDF');

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log('📂 Carpeta creada:', folderPath);
  }

  return folderPath;
}

// Devuelve la ruta de archivo en disco a partir de la URL /facturas/:id/pdf
function getPdfPathFromUrl(originalUrl) {
  const folderPath = getFacturasFolder();

  // Buscar ID de factura en la URL
  const match = originalUrl.match(/\/facturas\/(\d+)\/pdf/);
  if (match) {
    const facturaId = match[1];
    const numeroFactura = `INT-${String(facturaId).padStart(4, '0')}`;
    return path.join(folderPath, `Factura_${numeroFactura}.pdf`);
  }

  // Si no es una factura (por ejemplo un cierre de caja), nombre genérico
  return path.join(folderPath, `Reporte_${Date.now()}.pdf`);
}

// Descarga el PDF SOLO si no existe todavía, y devuelve la ruta en disco
async function descargarPdfSiNoExiste(url) {
  console.log('📌 descargarPdfSiNoExiste URL recibida:', url);

  // 1. Si es ya una ruta local y existe → no hacemos nada
  if (!url.startsWith('http') && fs.existsSync(url)) {
    console.log('📄 Ya es un archivo local existente:', url);
    return url;
  }

  // 2. Para construir nombre de archivo usamos la URL "lógica" (relativa)
  const urlLogica = url.startsWith('http')
    ? new URL(url).pathname // ej. /facturas/4/pdf
    : url;                  // ej. /facturas/4/pdf

  const filePath = getPdfPathFromUrl(urlLogica);

  // Si el archivo ya está descargado, lo reutilizamos
  if (fs.existsSync(filePath)) {
    console.log('♻️ PDF ya existe, no se vuelve a descargar:', filePath);
    return filePath;
  }

  // 3. Construimos la URL absoluta para hacer la petición HTTP
  let fullUrl = url;
  if (!fullUrl.startsWith('http')) {
    fullUrl = `http://localhost:4000${url}`;
  }

  console.log('[MAIN] Descargando PDF desde:', fullUrl);

  const client = fullUrl.startsWith('https') ? https : http;

  await new Promise((resolve, reject) => {
    client
      .get(fullUrl, (response) => {
        if (response.statusCode !== 200) {
          return reject(
            new Error(`Error al descargar PDF: ${response.statusCode}`)
          );
        }

        const fileStream = fs.createWriteStream(filePath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`✅ PDF guardado como: ${filePath}`);
          resolve();
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });

  return filePath;
}

// ==============================
// IPC: PDF
// ==============================

// 👉 Handler para abrir PDF (descarga si hace falta y luego lo abre)
ipcMain.handle('abrir-pdf', async (event, url) => {
  console.log('📌 IPC abrir-pdf con URL:', url);

  try {
    const filePath = await descargarPdfSiNoExiste(url);
    const openError = await shell.openPath(filePath);

    if (openError) {
      console.error('❌ Error al abrir PDF:', openError);
      return { success: false, path: filePath, error: openError };
    }

    return { success: true, path: filePath, error: null };
  } catch (error) {
    console.error('❌ Error general en abrir-pdf:', error);
    return { success: false, error };
  }
});

// 👉 Handler para SOLO descargar PDF (sin abrirlo)
ipcMain.handle('descargar-pdf', async (event, url) => {
  console.log('📌 IPC descargar-pdf con URL:', url);

  try {
    const filePath = await descargarPdfSiNoExiste(url);
    return { success: true, path: filePath, error: null };
  } catch (error) {
    console.error('❌ Error general en descargar-pdf:', error);
    return { success: false, error };
  }
});

// ==============================
// Backend + ventana
// ==============================

function iniciarBackend() {
  console.log('Iniciando backend...');

  // 👉 usar index.js de la RAÍZ del proyecto
  const backendPath = path.join(__dirname, 'index.js');

  backendProcess = spawn('node', [backendPath], { shell: true });

  backendProcess.stdout.on('data', (data) =>
    console.log(`BACKEND: ${data}`)
  );
  backendProcess.stderr.on('data', (data) =>
    console.error(`BACKEND ERROR: ${data}`)
  );
}


function crearVentana() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL('http://localhost:4000/pos');
}

app.whenReady().then(() => {
  iniciarBackend();
  // pequeño delay para que el backend levante
  setTimeout(crearVentana, 2000);
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  app.quit();
});
