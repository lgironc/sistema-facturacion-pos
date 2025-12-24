const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const sequelize = require('../database');
const { Op } = require('sequelize');
const { getPaths } = require('../utils/paths');
const { rutasPDFDir } = getPaths();



const {
  Ruta,
  RutaDetalle,
  Producto
} = require('../models');

// 🚦 Ruta de prueba
router.get('/ping', (req, res) => {
  res.json({ ok: true, msg: 'Router de rutas funcionando' });
});

router.get('/', async (req, res) => {
  try {
    const rutas = await Ruta.findAll({
      order: [['fecha', 'DESC'], ['id', 'DESC']]
    });
    return res.json(rutas);
  } catch (error) {
    console.error('Error en GET /rutas:', error);
    return res.status(500).json({ error: 'Error obteniendo rutas' });
  }
});



// ======================================
// POST /rutas  → Crear salida de camión
// ======================================
router.post('/', async (req, res) => {
  try {
   const { fecha, nombre, direccion, piloto, licencia, condicion, placa, observaciones, productos } = req.body;

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
  placa,
  observaciones
});


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

    res.json({ ok: true, rutaId: ruta.id });

  } catch (error) {
    console.error('Error en POST /rutas:', error);
    res.status(500).json({ error: 'Error creando la ruta' });
  }
});

router.get('/devoluciones/flat', async (req, res) => {
  try {
    const {
      nombre,
      direccion,
      vehiculo,  // -> RutaCabecera.placa
      fecha,     // exacta YYYY-MM-DD
      desde,     // rango YYYY-MM-DD
      hasta      // rango YYYY-MM-DD
    } = req.query;

    // WHERE para la cabecera de ruta
    const whereRuta = {};

    if (nombre && nombre.trim()) {
      whereRuta.nombre = { [Op.like]: `%${nombre.trim()}%` };
    }

    if (direccion && direccion.trim()) {
      whereRuta.direccion = { [Op.like]: `%${direccion.trim()}%` };
    }

    if (vehiculo && vehiculo.trim()) {
      whereRuta.placa = { [Op.like]: `%${vehiculo.trim()}%` };
    }

    if (fecha && fecha.trim()) {
      whereRuta.fecha = fecha.trim();
    } else if ((desde && desde.trim()) || (hasta && hasta.trim())) {
      whereRuta.fecha = {};
      if (desde && desde.trim()) whereRuta.fecha[Op.gte] = desde.trim();
      if (hasta && hasta.trim()) whereRuta.fecha[Op.lte] = hasta.trim();
    }

    // Query principal: solo detalles con devolución
    const filas = await RutaDetalle.findAll({
      where: {
        cantidadDevuelta: { [Op.gt]: 0 }
      },
      attributes: [
        'id',
        'rutaId',
        'productoId',
        'cantidadSalida',
        'cantidadDevuelta'
      ],
      include: [
        {
          model: Ruta,
          as: 'RutaCabecera',
          required: true,
          where: whereRuta,
          attributes: ['id', 'fecha', 'nombre', 'direccion', 'placa', 'piloto']
        },
        {
          model: Producto,
          as: 'ProductoRuta',
          required: true,
          attributes: ['id', 'nombre']
        }
      ],
      order: [
        [{ model: Ruta, as: 'RutaCabecera' }, 'fecha', 'DESC'],
        [{ model: Ruta, as: 'RutaCabecera' }, 'id', 'DESC'],
        ['id', 'DESC']
      ]
    });

    // Formato listo para tabla plana
    const resultado = filas.map(d => ({
      detalleId: d.id,
      rutaId: d.rutaId,
      fecha: d.RutaCabecera?.fecha ?? null,
      nombre: d.RutaCabecera?.nombre ?? null,
      direccion: d.RutaCabecera?.direccion ?? null,
      vehiculo: d.RutaCabecera?.placa ?? null,
      piloto: d.RutaCabecera?.piloto ?? null,
      productoId: d.productoId,
      producto: d.ProductoRuta?.nombre ?? null,
      cantidadSalida: d.cantidadSalida,
      cantidadDevuelta: d.cantidadDevuelta
    }));

    return res.json(resultado);
  } catch (error) {
    console.error('Error en GET /rutas/devoluciones/flat:', error);
    return res.status(500).json({ error: 'Error obteniendo devoluciones (tabla plana)' });
  }
});

// ===============================================
// GET /rutas/devoluciones/resumen
// Resumen de rutas: muestra TODAS las rutas con detalles
// Total vendido (Q) = (salida - devuelto) * precioVenta
// devuelto NULL -> 0
// ===============================================
router.get('/devoluciones/resumen', async (req, res) => {
  try {
    const { nombre, direccion, vehiculo, fecha, desde, hasta } = req.query;

    const whereRuta = {};

    if (nombre && nombre.trim()) {
      whereRuta.nombre = { [Op.like]: `%${nombre.trim()}%` };
    }
    if (direccion && direccion.trim()) {
      whereRuta.direccion = { [Op.like]: `%${direccion.trim()}%` };
    }
    if (vehiculo && vehiculo.trim()) {
  whereRuta.vehiculo = { [Op.like]: `%${vehiculo.trim()}%` };
}
    if (fecha && fecha.trim()) {
      whereRuta.fecha = fecha.trim();
    } else if ((desde && desde.trim()) || (hasta && hasta.trim())) {
      whereRuta.fecha = {};
      if (desde && desde.trim()) whereRuta.fecha[Op.gte] = desde.trim();
      if (hasta && hasta.trim()) whereRuta.fecha[Op.lte] = hasta.trim();
    }

    const rutas = await Ruta.findAll({
      where: whereRuta,
      order: [['fecha', 'DESC'], ['id', 'DESC']],
      attributes: ['id', 'fecha', 'nombre', 'direccion', 'placa'],
      include: [
        {
          model: RutaDetalle,
          as: 'DetallesRuta',
          required: true,
          attributes: ['id', 'cantidadSalida', 'cantidadDevuelta', 'productoId'],
          include: [
            {
              model: Producto,
              as: 'ProductoRuta',
              required: true,
              attributes: ['id', 'nombre', 'precioVenta'] // ✅ NO pedir "precio"
            }
          ]
        }
      ]
    });

    const resultado = rutas.map(r => {
      const items = r.DetallesRuta || [];

      const totalVendidoQ = items.reduce((sum, d) => {
        const salida = Number(d.cantidadSalida || 0);
        const devuelta = Number(d.cantidadDevuelta || 0); // null -> 0
        const vendido = Math.max(0, salida - devuelta);
        const precio = Number(d.ProductoRuta?.precioVenta || 0);
        return sum + (vendido * precio);
      }, 0);

      return {
        rutaId: r.id,
        fecha: r.fecha ?? null,
        nombre: r.nombre ?? null,
        direccion: r.direccion ?? null,
        vehiculo: r.placa ?? null,
        totalVendidoQ
      };
    });

    return res.json(resultado);
  } catch (error) {
    console.error('Error en GET /rutas/devoluciones/resumen:', error);
    return res.status(500).json({ error: 'Error obteniendo resumen de rutas' });
  }
});


router.get('/:rutaId/detalle', async (req, res) => {
  try {
    const rutaId = Number(req.params.rutaId);
    if (!rutaId) return res.status(400).json({ error: 'rutaId inválido' });

    const ruta = await Ruta.findByPk(rutaId);
    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' });

    const detalles = await RutaDetalle.findAll({
      where: { rutaId },
      include: [{
        model: Producto,
        as: 'ProductoRuta',
        required: true,
        attributes: ['id', 'nombre', 'precioVenta']
      }],
      order: [['id', 'ASC']]
    });

    const items = detalles.map(d => {
      const salida = Number(d.cantidadSalida ?? 0);
      const dev = Number(d.cantidadDevuelta ?? 0);
      const vendido = salida - dev;

      const p = d.ProductoRuta;
const precio = Number(p?.precioVenta || 0);

return {
  detalleId: d.id,
  productoId: d.productoId,
  producto: p?.nombre ?? '',
  cantidadSalida: salida,
  cantidadDevuelta: dev,
  vendido,
  precio,
  total: Number((vendido * precio).toFixed(2))
};

    });

    return res.json({
      ruta: {
        id: ruta.id,
        fecha: ruta.fecha,
        nombre: ruta.nombre,
        direccion: ruta.direccion,
        vehiculo: ruta.placa
      },
      items
    });
  } catch (error) {
    console.error('Error en GET /rutas/:rutaId/detalle:', error);
    return res.status(500).json({ error: 'Error obteniendo detalle de ruta' });
  }
});

router.put('/detalle/:detalleId/devolucion', async (req, res) => {
  try {
    const detalleId = Number(req.params.detalleId);
    const { cantidadDevuelta } = req.body;

    const nuevaDev = Number(cantidadDevuelta);
    if (!Number.isFinite(nuevaDev) || nuevaDev < 0) {
      return res.status(400).json({ error: 'cantidadDevuelta inválida' });
    }

    const det = await RutaDetalle.findByPk(detalleId);
    if (!det) return res.status(404).json({ error: 'Detalle no encontrado' });

    const salida = Number(det.cantidadSalida ?? 0);
    if (nuevaDev > salida) {
      return res.status(400).json({ error: 'Devuelto no puede ser mayor que salida' });
    }

    det.cantidadDevuelta = nuevaDev;
    await det.save();

    return res.json({ ok: true, detalleId, cantidadDevuelta: nuevaDev });
  } catch (error) {
    console.error('Error PUT /rutas/detalle/:detalleId/devolucion:', error);
    return res.status(500).json({ error: 'Error actualizando devolución' });
  }
});



// =======================================================
// GET /rutas/:id/pdf  → Generar y GUARDAR PDF de la ruta
// =======================================================
router.get('/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;

    const ruta = await Ruta.findByPk(id, {
      include: [
        {
          model: RutaDetalle,
          as: 'DetallesRuta',
          include: [{ model: Producto, as: 'ProductoRuta' }]
        }
      ]
    });

    if (!ruta) {
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    const { rutasDir } = getPaths();

    if (!fs.existsSync(rutasPDFDir)) fs.mkdirSync(rutasPDFDir, { recursive: true });

    const filePath = path.join(rutasPDFDir, `Ruta_${id}.pdf`);

    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // =========================
    // ENCABEZADO
    // =========================
    doc.font('Helvetica-Bold').fontSize(20)
      .text('DEPÓSITO LA BENDICIÓN', { align: 'center' });

    doc.moveDown(0.5);
    doc.fontSize(14).text('HOJA DE RUTA', { align: 'center' });
    doc.moveDown(1);

    doc.font('Helvetica').fontSize(11);

    const fechaRuta = ruta.fecha
      ? new Date(ruta.fecha).toLocaleDateString()
      : '';

    doc.text(`Ruta No: ${ruta.id}`);
    doc.text(`Fecha: ${fechaRuta}`);
    doc.text(`Piloto: ${ruta.piloto || ''}`);
    doc.text(`Licencia: ${ruta.licencia || ''}`);
    doc.text(`Condición: ${ruta.condicion || ''}`);
    doc.text(`Nombre: ${ruta.nombre || ''}`);
    doc.text(`Dirección: ${ruta.direccion || ''}`);

    doc.moveDown(1);

    // =========================
    // TABLA MONOESPACIADA
    // =========================
 // =========================
// HEADER TABLA
// =========================
doc.font('Courier-Bold').fontSize(11);

const yHeader = doc.y;

doc.text(
  'CANT   PRODUCTO                          P.UNIT      TOTAL      DEVOLUCIÓN',
  50,
  yHeader
);

// línea debajo del header
doc.moveTo(40, yHeader + 18).lineTo(570, yHeader + 18).stroke();

// ⬇️ FORZAMOS la Y inicial de las filas (CLAVE)
doc.y = yHeader + 32;

doc.font('Courier').fontSize(11);

    doc.font('Courier').fontSize(11);

    let totalGeneral = 0;

    (ruta.DetallesRuta || []).forEach(det => {
      const prod = det.ProductoRuta;
      const cant = Number(det.cantidadSalida || 0);
      const precio = Number(prod?.precioVenta || 0);
      const nombre = prod?.nombre || 'N/D';
      const subtotal = cant * precio;

      totalGeneral += subtotal;

      const fila =
        String(cant).padEnd(6, ' ') +
        nombre.padEnd(32, ' ').slice(0, 32) +
        `Q${precio.toFixed(2)}`.padStart(12, ' ') +
        `Q${subtotal.toFixed(2)}`.padStart(11, ' ') +
        '     ________';

      doc.text(fila, 50, doc.y, { lineBreak: false });
      doc.y += 14;
    });

    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(570, doc.y).stroke();
    doc.moveDown(1);

    // =========================
    // TOTAL
    // =========================
    doc.font('Courier-Bold').fontSize(14);
    doc.text(`TOTAL: Q${totalGeneral.toFixed(2)}`, 350);

    doc.end();

    stream.on('finish', () => {
      res.sendFile(filePath);
    });

  } catch (error) {
    console.error('Error generando PDF de ruta:', error);
    res.status(500).json({
      error: 'Error generando PDF de la ruta',
      message: error.message
    });
  }
});



// =======================
// DEVOLUCIÓN DE RUTA
// =======================
// Espera body: { detalles: [ { rutaDetalleId, cantidadDevuelta } ] }
router.post('/:id/devolucion', async (req, res) => {
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
      const rutaDet = await RutaDetalle.findByPk(d.rutaDetalleId, { transaction: t });
      if (!rutaDet) continue;

      // ✅ asegura que pertenece a esta ruta
      if (Number(rutaDet.rutaId) !== Number(id)) continue;

      const prod = await Producto.findByPk(rutaDet.productoId, { transaction: t });
      if (!prod) continue;

      const salida = Number(rutaDet.cantidadSalida || 0);
      const devueltaActual = Number(rutaDet.cantidadDevuelta || 0);
      let nuevaDevuelta = Number(d.cantidadDevuelta || 0);

      if (nuevaDevuelta < 0) nuevaDevuelta = 0;
      if (nuevaDevuelta > salida) nuevaDevuelta = salida;

      const delta = nuevaDevuelta - devueltaActual;

      rutaDet.cantidadDevuelta = nuevaDevuelta;
      await rutaDet.save({ transaction: t });

      if (delta !== 0) {
        prod.stock = Number(prod.stock || 0) + delta;
        await prod.save({ transaction: t });
      }
    }

    await t.commit();
    return res.json({ ok: true });

  } catch (error) {
    console.error('Error en POST /rutas/:id/devolucion:', error);
    await t.rollback();
    return res.status(500).json({ error: 'Error guardando devolución de ruta', message: error.message });
  }
});


// ======================================
// GET /rutas/:id  → Detalle con productos (para devolución)
// ======================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const ruta = await Ruta.findByPk(id, {
      include: [
        {
          model: RutaDetalle,
          as: 'DetallesRuta',
          include: [
            { model: Producto, as: 'ProductoRuta' }
          ]
        }
      ]
    });

    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' });

    return res.json(ruta);
  } catch (error) {
    console.error('Error en GET /rutas/:id:', error);
    return res.status(500).json({ error: 'Error cargando detalles de la ruta' });
  }
});













module.exports = router;
