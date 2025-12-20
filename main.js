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


function ensureFolder(folder) {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    console.log('📂 Carpeta creada:', folder);
  }
}

ensureFolder(path.join(__dirname, 'facturasPDF'));
ensureFolder(path.join(__dirname, 'rutasPDF'));
ensureFolder(path.join(__dirname, 'cierresPDF'));




// Devuelve la ruta de archivo en disco a partir de la URL /facturas/:id/pdf
function getPdfPathFromUrl(originalUrl) {
  // FACTURAS
  let match = originalUrl.match(/\/facturas\/(\d+)\/pdf/);
  if (match) {
    const facturaId = match[1];
    const numeroFactura = `INT-${String(facturaId).padStart(4, '0')}`;
    return path.join(__dirname, 'facturasPDF', `Factura_${numeroFactura}.pdf`);
  }

  // RUTAS
  match = originalUrl.match(/\/rutas\/(\d+)\/pdf/);
  if (match) {
    const rutaId = match[1];
    return path.join(__dirname, 'rutasPDF', `Ruta_${rutaId}.pdf`);
  }

  // CIERRES
  match = originalUrl.match(/\/cierres\/(\d+)\/pdf/);
  if (match) {
    const cierreId = match[1];
    return path.join(__dirname, 'cierresPDF', `Cierre_${cierreId}.pdf`);
  }

  // Fallback
  return path.join(__dirname, 'facturasPDF', `Reporte_${Date.now()}.pdf`);
}

// Descarga el PDF SOLO si no existe todavía, y devuelve la ruta en disco
async function descargarPdfSiNoExiste(url) {
  console.log('📌 descargarPdfSiNoExiste URL recibida:', url);

  // Normalizamos URL lógica
  const urlLogica = url.startsWith('http')
    ? new URL(url).pathname
    : url;

  // Ruta física donde debería estar el PDF
  const filePath = getPdfPathFromUrl(urlLogica);

  // ✅ Si el PDF ya existe localmente, lo usamos
  if (fs.existsSync(filePath)) {
    console.log('📄 PDF local encontrado:', filePath);
    return filePath;
  }

  // 🚚 RUTAS: pedir al backend que lo genere
if (urlLogica.startsWith('/rutas/')) {
  let fullUrl = `http://localhost:4000${urlLogica}`;

  console.log('[MAIN] Generando PDF de ruta desde:', fullUrl);

  await new Promise((resolve, reject) => {
    http.get(fullUrl, (response) => {
      if (response.statusCode !== 200) {
  let body = '';
  response.on('data', chunk => body += chunk.toString());
  response.on('end', () => {
    reject(new Error(`Error generando PDF de ruta: ${response.statusCode} - ${body}`));
  });
  return;
}


      // No usamos el stream, solo esperamos a que el backend lo genere
      response.on('data', () => {});
      response.on('end', resolve);
    }).on('error', reject);
  });

  // ⏳ Esperar un momento a que se escriba en disco
  await new Promise(res => setTimeout(res, 300));

  if (!fs.existsSync(filePath)) {
    throw new Error('El backend no creó el PDF de la ruta');
  }

  return filePath;
}


  // 🌐 FACTURAS / CIERRES → descargar por HTTP
  let fullUrl = url;
  if (!fullUrl.startsWith('http')) {
    fullUrl = `http://localhost:4000${urlLogica}`;
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
      .on('error', reject);
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

