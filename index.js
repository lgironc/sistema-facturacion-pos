// =======================
// IMPORTACIONES PRINCIPALES
// =======================
const express = require('express');
const path = require('path');
const sequelize = require('./src/database');
const PDFDocument = require('pdfkit');
const { Ruta, RutaDetalle, Producto, Cliente } = require('./src/models');
const configuracionRoutes = require('./src/routes/configuracion');
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
    await migrarTablaRuta();
    await migrarTablaRutaDetalles();
    console.log(' Base de datos SQLite sincronizada correctamente');

    await Cliente.findOrCreate({
      where: { nombre: 'Mostrador' },
      defaults: { telefono: '', direccion: '' }
    });
    console.log(' Cliente "Mostrador" disponible');
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
app.use('/configuracion', configuracionRoutes);

console.log(' Rutas dinamicas registradas');



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
// ✅ HEALTHCHECK (para Electron)
// =======================
app.get('/ping', (req, res) => {
  res.status(200).send('ok');
});


// =======================
// ARRANQUE SERVIDOR
// =======================
async function iniciarServidor() {
  await iniciarBaseDatos();
  app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error(' Error levantando servidor:', err.message);
});

}
async function migrarTablaRuta() {
  const qi = sequelize.getQueryInterface();

  try {
    const tabla = await qi.describeTable('Ruta');

    if (!tabla.observaciones) {
      await sequelize.query(`ALTER TABLE Ruta ADD COLUMN observaciones TEXT;`);
      console.log('Columna Ruta.observaciones creada');
    }

    if (!tabla.estado) {
      await sequelize.query(`ALTER TABLE Ruta ADD COLUMN estado VARCHAR(255) NOT NULL DEFAULT 'ABIERTA';`);
      console.log(' Columna Ruta.estado creada');
    }

    if (!tabla.totalEsperado) {
      await sequelize.query(`ALTER TABLE Ruta ADD COLUMN totalEsperado DECIMAL(10,2) NOT NULL DEFAULT 0;`);
      console.log(' Columna Ruta.totalEsperado creada');
    }

    if (!tabla.totalCobrado) {
      await sequelize.query(`ALTER TABLE Ruta ADD COLUMN totalCobrado DECIMAL(10,2) NOT NULL DEFAULT 0;`);
      console.log(' Columna Ruta.totalCobrado creada');
    }

    if (!tabla.diferencia) {
      await sequelize.query(`ALTER TABLE Ruta ADD COLUMN diferencia DECIMAL(10,2) NOT NULL DEFAULT 0;`);
      console.log(' Columna Ruta.diferencia creada');
    }

    if (!tabla.fechaLiquidacion) {
      await sequelize.query(`ALTER TABLE Ruta ADD COLUMN fechaLiquidacion DATETIME;`);
      console.log(' Columna Ruta.fechaLiquidacion creada');
    }
  } catch (error) {
    console.error(' Error migrando tabla Ruta:', error);
    throw error;
  }
}

async function migrarTablaRutaDetalles() {
  const qi = sequelize.getQueryInterface();

  try {
    const tabla = await qi.describeTable('RutaDetalles');

    if (!tabla.precioVenta) {
      await sequelize.query(`ALTER TABLE RutaDetalles ADD COLUMN precioVenta DECIMAL(10,2) NOT NULL DEFAULT 0;`);
      console.log(' Columna RutaDetalles.precioVenta creada');
    }
  } catch (error) {
    console.error(' Error migrando tabla RutaDetalles:', error);
    throw error;
  }
}
iniciarServidor();
