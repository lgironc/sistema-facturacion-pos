const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const sequelize = require('../database');



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
    const { fecha, piloto, vehiculo, observaciones, productos } = req.body;

    if (!fecha || !piloto || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ error: 'Datos incompletos para crear ruta' });
    }

    const ruta = await Ruta.create({
      fecha,
      piloto,
      vehiculo,
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
      include: [
        { model: Producto, as: 'ProductoRuta' }
      ]
    }
  ]
});



    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada' });

    const rutasDir = path.join(__dirname, '..', '..', 'rutasPDF');
    if (!fs.existsSync(rutasDir)) fs.mkdirSync(rutasDir, { recursive: true });

    const filePath = path.join(rutasDir, `Ruta_${id}.pdf`);

    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    doc.fontSize(20).text('DEPÓSITO LA BENDICIÓN', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).text('HOJA DE RUTA', { align: 'center' });
    doc.moveDown(1);

    const fechaRuta = ruta.fecha ? new Date(ruta.fecha).toLocaleDateString() : '';
    doc.fontSize(11);
    doc.text(`Ruta No: ${id}`);
    doc.text(`Fecha: ${fechaRuta}`);
    doc.text(`Piloto: ${ruta.piloto || ''}`);
    if (ruta.placa) doc.text(`Placa: ${ruta.placa}`);
    if (ruta.licencia) doc.text(`Licencia: ${ruta.licencia}`);
    if (ruta.condicion) doc.text(`Condición: ${ruta.condicion}`);
    if (ruta.nombre) doc.text(`Nombre: ${ruta.nombre}`);
    if (ruta.direccion) doc.text(`Dirección: ${ruta.direccion}`);
    doc.moveDown(1);

    doc.font('Helvetica-Bold');
    doc.text('CANT', 50);
    doc.text('PRODUCTO', 100);
    doc.text('P. UNIT', 360, undefined, { width: 80, align: 'right' });
    doc.text('TOTAL', 450, undefined, { width: 80, align: 'right' });

    doc.moveDown(0.3).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica');

    let totalGeneral = 0;

    const detalles = ruta.DetallesRuta || [];
    detalles.forEach(det => {
      const prod = det.ProductoRuta;
      const cant = Number(det.cantidadSalida || 0);
      const precio = Number(prod?.precioVenta || 0);
      const nombre = prod?.nombre || 'N/D';
      const subtotal = cant * precio;

      totalGeneral += subtotal;

      const y = doc.y;
      doc.text(String(cant), 50, y);
      doc.text(nombre, 100, y, { width: 240 });
      doc.text(`Q${precio.toFixed(2)}`, 360, y, { width: 80, align: 'right' });
      doc.text(`Q${subtotal.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
      doc.moveDown(0.8);
    });

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    doc.font('Helvetica-Bold').fontSize(14)
      .text(`TOTAL: Q${totalGeneral.toFixed(2)}`, 350, doc.y, { width: 200, align: 'right' });

    doc.end();

    writeStream.on('finish', () => {
      return res.sendFile(filePath);

    });

  } catch (error) {
    console.error('Error generando PDF de ruta:', error);
    return res.status(500).json({
      error: 'Error generando PDF de la ruta',
      message: error.message
    });
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





module.exports = router;
