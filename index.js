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
    console.error('❌ Error al sincronizar la base de datos:', err);
  }
}

// =======================
// RUTAS DINÁMICAS
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
// 🚚 RUTAS - LISTADO Y DETALLE (para devolución)
// =======================

// LISTAR rutas (puedes filtrar después por fecha si quieres)
app.get('/rutas', async (req, res) => {
  try {
    const rutas = await Ruta.findAll({
      order: [['fecha', 'DESC'], ['id', 'DESC']]
    });

    res.json(rutas);
  } catch (error) {
    console.error('Error en GET /rutas:', error);
    res.status(500).json({ error: 'Error obteniendo rutas' });
  }
});

// OBTENER una ruta con sus detalles y productos
app.get('/rutas/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const ruta = await Ruta.findByPk(id, {
      include: [
        {
          model: RutaDetalle,
          as: 'DetallesRuta',
          include: [
            {
              model: Producto,
              as: 'ProductoRuta'
            }
          ]
        }
      ]
    });

    if (!ruta) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    res.json(ruta);
  } catch (error) {
    console.error('Error en GET /rutas/:id:', error);
    res.status(500).json({ error: 'Error cargando detalles de la ruta' });
  }
});


// ======================================
// 🚚 RUTAS - SALIDA DE CAMIÓN
// ======================================

// POST /rutas  → crear salida de camión y descontar stock
app.post('/rutas', async (req, res) => {
  try {
    const {
      fecha,
      nombre,
      direccion,
      piloto,
      licencia,
      condicion,
      placa,
      productos
    } = req.body;

    if (!fecha || !nombre || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ error: 'Datos incompletos para crear ruta' });
    }

    const ruta = await Ruta.create({
      fecha,
      nombre,
      direccion,
      piloto,
      licencia,
      condicion,
      placa
    });

    // detalles + stock igual que ya lo tenías
    for (const p of productos) {
      const prod = await Producto.findByPk(p.productoId);
      if (!prod) continue;

      await RutaDetalle.create({
        rutaId: ruta.id,
        productoId: p.productoId,
        cantidadSalida: p.cantidadSalida,
        cantidadDevuelta: 0
      });

      await prod.update({
        stock: prod.stock - p.cantidadSalida
      });
    }

    return res.json({ ok: true, rutaId: ruta.id });
  } catch (error) {
    console.error('Error en POST /rutas:', error);
    return res.status(500).json({ error: 'Error creando la ruta' });
  }
});


// GET /rutas/:id/pdf  → hoja de ruta en PDF
// GET /rutas/:id/pdf  → hoja de ruta estilo Excel




// =======================
// DEVOLUCIÓN DE RUTA
// =======================
// Espera body: { detalles: [ { rutaDetalleId, cantidadDevuelta } ] }
app.post('/rutas/:id/devolucion', async (req, res) => {
  const { id } = req.params;
  const { detalles } = req.body;

  if (!Array.isArray(detalles) || detalles.length === 0) {
    return res.status(400).json({ error: 'No se enviaron devoluciones' });
  }

  const t = await sequelize.transaction();

  try {
    const ruta = await Ruta.findByPk(id, { transaction: t });
    if (!ruta) {
      await t.rollback();
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    for (const d of detalles) {
      const rutaDet = await RutaDetalle.findByPk(d.rutaDetalleId, {
        transaction: t
      });
      if (!rutaDet) continue;

      const prod = await Producto.findByPk(rutaDet.productoId, {
        transaction: t
      });
      if (!prod) continue;

      const salida = Number(rutaDet.cantidadSalida || 0);
      const devueltaActual = Number(rutaDet.cantidadDevuelta || 0);
      let nuevaDevuelta = Number(d.cantidadDevuelta || 0);

      // Validaciones: [0, salida]
      if (nuevaDevuelta < 0) nuevaDevuelta = 0;
      if (nuevaDevuelta > salida) nuevaDevuelta = salida;

      const delta = nuevaDevuelta - devueltaActual; // cuánto aumenta la devolución

      // Actualizar detalle
      rutaDet.cantidadDevuelta = nuevaDevuelta;
      await rutaDet.save({ transaction: t });

      // Actualizar stock del producto (sumamos solo el delta)
      if (delta !== 0) {
        prod.stock = Number(prod.stock || 0) + delta;
        await prod.save({ transaction: t });
      }
    }

    await t.commit();
    res.json({ ok: true });
  } catch (error) {
    console.error('Error en POST /rutas/:id/devolucion:', error);
    await t.rollback();
    res.status(500).json({ error: 'Error guardando devolución de ruta' });
  }
});


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
    console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  });
}

iniciarServidor();
