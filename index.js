// =======================
// IMPORTACIONES PRINCIPALES
// =======================
const express = require('express');
const path = require('path');
const sequelize = require('./src/database'); // Conexión a SQLite
const { Cliente } = require('./src/models'); // Importamos Cliente para crear "Mostrador"
require('./src/models'); // Importar modelos + relaciones

// Crear la app de Express
const app = express();
const PORT = 4000;

// =======================
// MIDDLEWARES
// =======================
app.use(express.json());



// =======================
// SINCRONIZAR base de datos y crear cliente Mostrador si no existe
// =======================
async function iniciarBaseDatos() {
  try {
    await sequelize.sync({ alter: true });
    console.log('✅ Base de datos SQLite sincronizada correctamente');

    // ✅ Crear cliente "Mostrador" automáticamente si no existe
    await Cliente.findOrCreate({
      where: { nombre: 'Mostrador' },
      defaults: { telefono: '', direccion: '' }
    });
    console.log('✅ Cliente "Mostrador" disponible');

  } catch (err) {
    console.error('❌ Error al sincronizar la base de datos:', err);
  }
}

// =======================
// RUTAS DINÁMICAS (PRIMERO)
// =======================
console.log('📍Registrando rutas');
app.use('/proveedores', require('./src/routes/proveedores'));
app.use('/productos', require('./src/routes/productos'));
app.use('/compras', require('./src/routes/compras'));
app.use('/facturas', require('./src/routes/facturas'));
app.use('/clientes', require('./src/routes/clientes'));
app.use('/historial', require('./src/routes/historial'));
app.use('/finanzas', require('./src/routes/finanzas'));
app.use('/cuentas', require('./src/routes/cuentasPorCobrar'));



console.log('✅ Rutas dinámicas registradas');

// =======================
// SERVIR ARCHIVOS ESTÁTICOS (DESPUÉS)
// =======================
app.use(express.static(path.join(__dirname, 'src/public')));

// =======================
// RUTA DE INICIO
// =======================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/public/index.html'));
});

// =======================
// RUTA POS (Punto de Venta)
// =======================
app.get('/pos', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/public/pos.html'));
});

// =======================
// ARRANQUE SERVIDOR
// =======================
async function iniciarServidor() {
  await iniciarBaseDatos();
  app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  });
}

iniciarServidor();
