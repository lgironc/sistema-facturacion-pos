const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const os = require('os');

console.log('main.js cargado correctamente');

let win;

// ✅ Forzar userData dentro de la carpeta del .exe (PORTABLE REAL)
if (app.isPackaged) {
  const portableDir = path.join(path.dirname(app.getPath('exe')), 'DataApp');
  app.setPath('userData', portableDir);
}

// ==============================
// ✅ Paths portables (DB + PDFs)
// ==============================
const { getPaths } = require('./src/utils/paths');

const {
  facturasPDFDir,
  rutasPDFDir,
  cierresPDFDir
} = getPaths();

// ==============================
// 🔹 Helpers
// ==============================
function ensureFolder(folder) {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    console.log(' Carpeta creada:', folder);
  }
}

ensureFolder(facturasPDFDir);
ensureFolder(rutasPDFDir);
ensureFolder(cierresPDFDir);

// ==============================
// 🔹 PDF paths
// ==============================
function getPdfPathFromUrl(originalUrl) {
  // ✅ PROTECCIÓN CRÍTICA
  if (!originalUrl || typeof originalUrl !== 'string') {
    console.warn(' getPdfPathFromUrl recibió originalUrl inválido:', originalUrl);
    return path.join(facturasPDFDir, `Reporte_${Date.now()}.pdf`);
  }

  // FACTURAS
  let match = originalUrl.match(/\/facturas\/(\d+)\/pdf/);
  if (match) {
    const facturaId = match[1];
    const numeroFactura = `INT-${String(facturaId).padStart(4, '0')}`;
    return path.join(facturasPDFDir, `Factura_${numeroFactura}.pdf`);
  }

    // TICKETS (FACTURAS)
  match = originalUrl.match(/\/facturas\/(\d+)\/ticket/);
  if (match) {
    const facturaId = match[1];
    const numeroFactura = `INT-${String(facturaId).padStart(4, '0')}`;
    return path.join(facturasPDFDir, `Ticket_${numeroFactura}.pdf`);
  }

  // RUTAS
  match = originalUrl.match(/\/rutas\/(\d+)\/pdf/);
  if (match) {
    const rutaId = match[1];
    return path.join(rutasPDFDir, `Ruta_${rutaId}.pdf`);
  }

  // CIERRES (por ID, si algún día los usas)
  match = originalUrl.match(/\/cierres\/(\d+)\/pdf/);
  if (match) {
    const cierreId = match[1];
    return path.join(cierresPDFDir, `Cierre_${cierreId}.pdf`);
  }

  // 🧾 CIERRE DE CAJA por rango (finanzas)
  if (originalUrl.startsWith('/finanzas/cierre/pdf')) {
    try {
      const u = new URL('http://localhost' + originalUrl);
      const desde = u.searchParams.get('desde') || 'hoy';
      const hasta = u.searchParams.get('hasta') || 'hoy';
      return path.join(cierresPDFDir, `Cierre_${desde}_a_${hasta}.pdf`);
    } catch (e) {
      console.warn(' No se pudo parsear URL de cierre:', originalUrl);
    }
  }

  // Fallback seguro
  return path.join(facturasPDFDir, `Reporte_${Date.now()}.pdf`);
}


async function descargarPdfSiNoExiste(url) {
  console.log(' descargarPdfSiNoExiste URL recibida:', url);

  const urlLogica = url.startsWith('http') ? new URL(url).pathname : url;
  const filePath = getPdfPathFromUrl(urlLogica);

  if (fs.existsSync(filePath)) {
    console.log(' PDF local encontrado:', filePath);
    return filePath;
  }

  // Descargar/generar desde backend
  let fullUrl = url.startsWith('http') ? url : `http://localhost:4000${urlLogica}`;
  const client = fullUrl.startsWith('https') ? https : http;

  console.log('[MAIN] Descargando/Generando PDF desde:', fullUrl);

  await new Promise((resolve, reject) => {
    client.get(fullUrl, (response) => {
      if (response.statusCode !== 200) {
        let body = '';
        response.on('data', chunk => (body += chunk.toString()));
        response.on('end', () => reject(new Error(`Error PDF ${response.statusCode} - ${body}`)));
        return;
      }

      const fileStream = fs.createWriteStream(filePath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(` PDF guardado como: ${filePath}`);
        resolve();
      });
    }).on('error', reject);
  });

  return filePath;
}

// ==============================
// IPC: PDF
// ==============================
ipcMain.handle('abrir-pdf', async (_event, url) => {
  console.log(' IPC abrir-pdf con URL:', url);

  try {
    const filePath = await descargarPdfSiNoExiste(url);
    const openError = await shell.openPath(filePath);

    if (openError) {
      console.error(' Error al abrir PDF:', openError);
      return { success: false, path: filePath, error: openError };
    }

    return { success: true, path: filePath, error: null };
  } catch (error) {
    console.error('Error general en abrir-pdf:', error);
    return { success: false, error: error.message };
  }
});

// ==============================
// IPC: DESCARGAR PDF (guardar sin abrir)
// ==============================
ipcMain.handle('descargar-pdf', async (_event, url) => {
  console.log('📥 IPC descargar-pdf con URL:', url);

  try {
    const filePath = await descargarPdfSiNoExiste(url);
    return { success: true, path: filePath };
  } catch (error) {
    console.error('❌ Error en descargar-pdf:', error);
    return { success: false, error: error.message };
  }
});

// ==============================
// IPC: IMPRIMIR PDF (robusto) - embebe PDF en HTML y espera render
// ==============================
ipcMain.handle('imprimir-pdf', async (_event, url) => {
  console.log('🖨️ IPC imprimir-pdf con URL:', url);

  let printWin = null;

  try {
    const urlHtml = url; // imprime el mismo /ticket (ya es HTML)
    const fullUrl = urlHtml.startsWith('http')
      ? urlHtml
      : `http://localhost:4000${urlHtml}`;

    printWin = new BrowserWindow({
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: { sandbox: false }
    });

    await printWin.loadURL(fullUrl);

    // esperar render
    await new Promise(r => setTimeout(r, 400));

    const out = await new Promise(resolve => {
      printWin.webContents.print(
        {
          silent: false,
          printBackground: false,
          scaleFactor: 1.0,
          deviceName: 'AON Printer', // opcional
        marginsType: 1
       
        },
        (success, reason) => resolve({ success, error: success ? null : (reason || 'Fallo impresión') })
      );
    });

    return out;

  } catch (e) {
    console.error('❌ Error imprimiendo:', e);
    return { success: false, error: e.message };
  } finally {
    if (printWin) { try { printWin.close(); } catch (_) {} }
  }
});

ipcMain.handle('abrir-cajon', async (_event, printerName = 'AON Printer') => {
  try {
    // Comando ESC/POS para abrir cajón:
    // ESC p m t1 t2  -> 1B 70 00 19 FA (muy común)
    const bytes = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);

    // Creamos un archivo temporal .bin
    const tmpPath = path.join(os.tmpdir(), `open_drawer_${Date.now()}.bin`);
    fs.writeFileSync(tmpPath, bytes);

    // Enviar RAW al spooler usando PowerShell
    // Copy-Item -Path file -Destination "\\localhost\PrinterShare" no sirve si no está compartida.
    // Mejor: usar Out-Printer, pero necesita texto.
    // Alternativa sólida: usar "print /d:" NO manda RAW.
    //
    // Lo más confiable: usar la API Win32 (pero sería addon nativo).
    //
    // Así que te dejo la variante práctica: compartir impresora y copiar a share (manda RAW).
    // 1) Comparte la impresora como "AONPrinterShare"
    // 2) Usa ese share aquí:
    const shareName = 'AONPrinterShare'; // <-- CAMBIA ESTE NOMBRE AL SHARE REAL
    const dest = `\\\\localhost\\\\${shareName}`;

    await new Promise((resolve, reject) => {
      execFile('cmd.exe', ['/c', 'copy', '/b', tmpPath, dest], (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve();
      });
    });

    return { success: true };
  } catch (e) {
    console.error('❌ abrir-cajon:', e);
    return { success: false, error: e.message };
  }
});

// ==============================
// Backend embebido (MISMO proceso)
// ==============================
function iniciarBackendEmbebido() {
  console.log(' Iniciando backend embebido...');
  require(path.join(__dirname, 'index.js'));
}

// Esperar a que el backend responda /ping
function esperarBackendListo(timeoutMs = 15000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      http.get('http://localhost:4000/ping', (res) => {
        if (res.statusCode === 200) return resolve();
        retry();
      }).on('error', retry);

      function retry() {
        if (Date.now() - started > timeoutMs) {
          return reject(new Error('Backend no respondió /ping a tiempo'));
        }
        setTimeout(tick, 300);
      }
    };
    tick();
  });
}

// ==============================
// Ventana
// ==============================
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

app.whenReady().then(async () => {
  iniciarBackendEmbebido();

  try {
    await esperarBackendListo();
    crearVentana();
  } catch (e) {
    console.error(' No se pudo iniciar backend:', e.message);
    app.quit();
  }
});



app.on('window-all-closed', () => {
  app.quit();
});
