const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const os = require('os');

console.log('BACE POS cargado correctamente');

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
  ticketsPDFDir, 
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
ensureFolder(ticketsPDFDir);
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
    return path.join(ticketsPDFDir, `Ticket_${numeroFactura}.pdf`);
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


// ==============================
// Helper: descargar PDF y guardarlo localmente
// ==============================
async function descargarPdfSiNoExiste(url) {
  const fullUrl = url.startsWith('http') ? url : `http://localhost:4000${url}`;

  // Carpeta destino (más estable que OneDrive): %TEMP%/bacepos_pdfs
  const dir = path.join(os.tmpdir(), 'bacepos_pdfs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Nombre de archivo limpio (sin query)
  // Ej: /facturas/54/ticket?pdf=1  -> facturas_54_ticket.pdf
  const clean = fullUrl.split('?')[0]
    .replace(/^https?:\/\/[^/]+/i, '')  // quita dominio
    .replace(/^\//, '')
    .replace(/[\/\\:]+/g, '_');         // rutas a underscores

  const filePath = path.join(dir, `${clean}.pdf`);

  // Si ya existe y tiene tamaño > 1KB, lo reutilizamos
  try {
    if (fs.existsSync(filePath)) {
      const st = fs.statSync(filePath);
      if (st.size > 1024) return filePath;
    }
  } catch (_) {}

  // Descargar
  const resp = await fetch(fullUrl, {
    method: 'GET',
    headers: { 'Accept': 'application/pdf' }
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} al descargar PDF: ${fullUrl}`);
  }

  const contentType = (resp.headers.get('content-type') || '').toLowerCase();
  const buf = Buffer.from(await resp.arrayBuffer());

  // Validación fuerte: debe ser PDF real
  const isPdfByHeader = buf.slice(0, 4).toString('utf8') === '%PDF';
  const isPdfByType = contentType.includes('application/pdf');

  if (!isPdfByHeader && !isPdfByType) {
    // Guardamos debug para ver qué llegó
    const debugPath = path.join(dir, `${clean}.debug.html`);
    try { fs.writeFileSync(debugPath, buf); } catch (_) {}
    throw new Error(`El endpoint no devolvió PDF. content-type="${contentType}". Se guardó debug: ${debugPath}`);
  }

  // Guardar buffer completo
  fs.writeFileSync(filePath, buf);

  // Verificación final
  const st2 = fs.statSync(filePath);
  if (st2.size < 1024) {
    throw new Error(`PDF descargado pero muy pequeño (${st2.size} bytes): ${filePath}`);
  }

  return filePath;
}

// ==============================
// IPC: PDF
// ==============================
ipcMain.handle('abrir-pdf', async (_event, url) => {
  console.log('📄 IPC abrir-pdf con URL:', url);
  try {
    const filePath = await descargarPdfSiNoExiste(url);
    console.log('✅ PDF local:', filePath);

    const openError = await shell.openPath(filePath);
    if (openError) return { success: false, path: filePath, error: openError };

    return { success: true, path: filePath, error: null };
  } catch (error) {
    console.error(' Error general en abrir-pdf:', error);
    return { success: false, error: error.message };
  }
});

// ==============================
// IPC: DESCARGAR PDF (guardar sin abrir)
// ==============================
ipcMain.handle('descargar-pdf', async (_event, url) => {
  console.log(' IPC descargar-pdf con URL:', url);

  try {
    const filePath = await descargarPdfSiNoExiste(url);
    return { success: true, path: filePath };
  } catch (error) {
    console.error(' Error en descargar-pdf:', error);
    return { success: false, error: error.message };
  }
});

// ==============================
// IPC: IMPRIMIR PDF (robusto) - carga URL y imprime sin márgenes
// ==============================
// ==============================
// IPC: IMPRIMIR PDF (sin feed extra)
// - NO carga el PDF directo (visor PDF mete margen/feed)
// - Envuelve el PDF en HTML con @page margin 0 y lo imprime
// ==============================
ipcMain.handle('imprimir-pdf', async (_event, url) => {
  console.log(' IPC imprimir-pdf con URL:', url);

  let printWin = null;

  try {
    const fullUrl = url.startsWith('http') ? url : `http://localhost:4000${url}`;

    // HTML en memoria (NO endpoint nuevo)
    const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  /* Tamaño térmico + cero margen */
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: white; }
  /* Embebemos el PDF sin márgenes */
  iframe { position: fixed; left: 0; top: 0; width: 80mm; height: 100vh; border: 0; }
</style>
</head>
<body>
  <iframe id="pdf" src="${fullUrl}"></iframe>
  <script>
    const f = document.getElementById('pdf');
    // Esperar a que el iframe cargue el PDF y luego imprimir
    f.onload = () => setTimeout(() => window.print(), 200);
  </script>
</body>
</html>`;

    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);

    printWin = new BrowserWindow({
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: { sandbox: false }
    });

    await printWin.loadURL(dataUrl);

    // Esperar render/print
    await new Promise(r => setTimeout(r, 800));

    const options = {
      silent: false, // cuando ya esté bien, lo pones true
      printBackground: true,
      margins: { marginType: 'none' },
      scaleFactor: 100,
      deviceName: 'AON Printer' // opcional
    };

    const out = await new Promise((resolve) => {
      printWin.webContents.print(options, (success, reason) => {
        resolve({ success, error: success ? null : (reason || 'Fallo impresión') });
      });
    });

    return out;

  } catch (e) {
    console.error('❌ Error imprimiendo:', e);
    return { success: false, error: e.message };
  } finally {
    if (printWin) { try { printWin.destroy(); } catch (_) {} }
  }
});

ipcMain.handle('abrir-carpeta', async (_event, carpeta) => {
  try {
    let dir = facturasPDFDir;
    if (carpeta === 'tickets') dir = ticketsPDFDir;
    if (carpeta === 'facturas') dir = facturasPDFDir;

    const openError = await shell.openPath(dir);
    if (openError) return { success: false, error: openError };

    return { success: true, path: dir };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('crear-backup', async () => {
  try {
    const { backupsDir, databasePath, dbPath } = getPaths();
    const sourceDb = databasePath || dbPath;

    if (!sourceDb || !fs.existsSync(sourceDb)) {
      return { success: false, error: 'No se encontró la base de datos.' };
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');

    const fileName = `Backup_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.sqlite`;
    const backupPath = path.join(backupsDir, fileName);

    fs.copyFileSync(sourceDb, backupPath);

    return {
      success: true,
      path: backupPath,
      fileName
    };
  } catch (error) {
    console.error(' Error creando backup:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('abrir-carpeta-backups', async () => {
  try {
    const { backupsDir } = getPaths();
    const openError = await shell.openPath(backupsDir);

    if (openError) return { success: false, error: openError };

    return { success: true, path: backupsDir };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('restaurar-backup', async () => {
  try {
    const { databasePath, dbPath, backupsDir } = getPaths();
    const targetDb = databasePath || dbPath;

    if (!targetDb) {
      return { success: false, error: 'No se encontró la ruta de la base de datos.' };
    }

    if (!fs.existsSync(targetDb)) {
      return { success: false, error: 'No existe la base de datos actual para respaldar/restaurar.' };
    }

    const result = await dialog.showOpenDialog({
      title: 'Seleccionar respaldo',
      defaultPath: backupsDir,
      properties: ['openFile'],
      filters: [
        { name: 'Respaldos SQLite', extensions: ['sqlite', 'db'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePaths || !result.filePaths.length) {
      return { success: false, canceled: true, error: 'Selección cancelada.' };
    }

    const sourceFile = result.filePaths[0];

    if (!fs.existsSync(sourceFile)) {
      return { success: false, error: 'El archivo seleccionado no existe.' };
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

    // 1) Respaldo automático de seguridad antes de restaurar
    const safetyBackupName = `SafetyBackup_antes_de_restaurar_${timestamp}.sqlite`;
    const safetyBackupPath = path.join(backupsDir, safetyBackupName);

    fs.copyFileSync(targetDb, safetyBackupPath);

    // 2) Restaurar el archivo seleccionado sobre la base actual
    fs.copyFileSync(sourceFile, targetDb);

    return {
      success: true,
      restoredFrom: sourceFile,
      safetyBackup: safetyBackupPath,
      message: 'Respaldo restaurado correctamente. Se creó una copia de seguridad automática antes de restaurar. Reinicia la aplicación para aplicar los cambios.'
    };
  } catch (error) {
    console.error(' Error restaurando backup:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('reiniciar-app', async () => {
  try {
    app.relaunch();
    app.exit(0);
    return { success: true };
  } catch (error) {
    console.error(' Error reiniciando app:', error);
    return { success: false, error: error.message };
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
    title: 'BACE POS',
    autoHideMenuBar: true,
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
