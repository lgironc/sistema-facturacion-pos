// =======================
// IMPORTACIONES PRINCIPALES
// =======================
const express = require('express');
const path = require('path');
const sequelize = require('./src/database');
const PDFDocument = require('pdfkit');
const { Ruta, RutaDetalle, Producto, Cliente } = require('./src/models');
require('./src/models');



// Crear la app de Express
const app = express();
const PORT = 4000;

// =======================
// MIDDLEWARES
// =======================
app.use(express.json());

// =======================
// SINCRONIZAR BD
// =======================
async function iniciarBaseDatos() {
  try {
    await sequelize.sync({ alter: false });
    console.log('✅ Base de datos SQLite sincronizada correctamente');

    await Cliente.findOrCreate({
      where: { nombre: 'Mostrador' },
      defaults: { telefono: '', direccion: '' }
    });
    console.log('✅ Cliente "Mostrador" disponible');
  } catch (err) {
    console.error(' Error al sincronizar la base de datos:', err);
  }
}

// =======================
// RUTAS DINÁMICAS
// =======================
console.log('Registrando rutas');

app.use('/proveedores', require('./src/routes/proveedores'));
app.use('/productos', require('./src/routes/productos'));
app.use('/compras', require('./src/routes/compras'));
app.use('/facturas', require('./src/routes/facturas'));
app.use('/clientes', require('./src/routes/clientes'));
app.use('/historial', require('./src/routes/historial'));
app.use('/finanzas', require('./src/routes/finanzas'));
app.use('/cuentas', require('./src/routes/cuentasPorCobrar'));
app.use('/rutas', require('./src/routes/rutas'));


console.log(' Rutas dinámicas registradas');



// GET /rutas/:id/pdf  → hoja de ruta en PDF
// GET /rutas/:id/pdf  → hoja de ruta estilo Excel






// =======================
// ESTÁTICOS + POS
// =======================
app.use(express.static(path.join(__dirname, 'src/public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/public/index.html'));
});

app.get('/pos', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/public/pos.html'));
});

// =======================
// ARRANQUE SERVIDOR
// =======================
async function iniciarServidor() {
  await iniciarBaseDatos();
  app.listen(PORT, () => {
    console.log(` Servidor corriendo en http://localhost:${PORT}`);
  });
}

iniciarServidor();
