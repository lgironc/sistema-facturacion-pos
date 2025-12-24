const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// crea carpeta si no existe
function ensureFolder(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getBaseDir() {
  // En .exe portable: carpeta donde está el exe
  if (app && app.isPackaged) return path.dirname(app.getPath('exe'));
  // En dev: raíz del proyecto (donde está main.js)
  return path.join(__dirname, '..', '..');
}

function getPaths() {
  const baseDir = getBaseDir();

  // Todo al lado del exe (portable)
  const dataDir = ensureFolder(path.join(baseDir, 'Data'));
  const pdfDirFacturas = ensureFolder(path.join(baseDir, 'facturasPDF'));
  const pdfDirRutas = ensureFolder(path.join(baseDir, 'rutasPDF'));
  const pdfDirCierres = ensureFolder(path.join(baseDir, 'cierresPDF'));

  const dbPath = path.join(dataDir, 'database.sqlite');

  return {
    baseDir,
    dataDir,
    dbPath,
    facturasPDFDir: pdfDirFacturas,
    rutasPDFDir: pdfDirRutas,
    cierresPDFDir: pdfDirCierres
  };
}

module.exports = { getPaths };
