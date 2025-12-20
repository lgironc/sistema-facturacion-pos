// src/routes/rutas.js
const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();



// 🚦 Ruta de prueba
router.get('/ping', (req, res) => {
  res.send('Ruta OK');
});

// ... (el resto de tu código POST / y GET /:id/pdf)
module.exports = router;


const {
  Ruta,
  RutaDetalle,
  Producto
} = require('../models');

// Solo para confirmar que el router está montado:
router.get('/ping', (req, res) => {
  res.json({ ok: true, msg: 'Router de rutas funcionando' });
});

// ======================================
// POST /rutas  → Crear salida de camión
// (realmente es POST /rutas/ porque lo montamos con app.use('/rutas', router))
// ======================================
router.post('/', async (req, res) => {
  try {
    const { fecha, piloto, vehiculo, observaciones, productos } = req.body;

    if (!fecha || !piloto || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ error: 'Datos incompletos para crear ruta' });
    }

    // Crear encabezado de la ruta
    const ruta = await Ruta.create({
      fecha,
      piloto,
      vehiculo,
      observaciones
    });

    // Crear detalles + descontar stock
    for (const p of productos) {
      const prod = await Producto.findByPk(p.productoId);
      if (!prod) continue;

      await RutaDetalle.create({
        rutaId: ruta.id,
        productoId: p.productoId,
        cantidadSalida: p.cantidadSalida,
        cantidadDevuelta: 0
      });

      // Descontar del stock lo que salió a ruta
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

// =======================================================
// GET /rutas/:id/pdf  → Generar PDF de la hoja de la ruta
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

    // PDF headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Ruta_${id}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.pipe(res);

    // HEADER
    doc.fontSize(16).text('SISTEMA DE FACTURACIÓN POS', { align: 'center' });
    doc.fontSize(14).text('HOJA DE RUTA CAMIÓN', { align: 'center' });

    doc.moveDown(1);

    const fechaStr = ruta.fecha
      ? new Date(ruta.fecha).toLocaleDateString()
      : '';

    doc.fontSize(10);
    doc.text(`FECHA:       ${fechaStr}`);
    doc.text(`NOMBRE:      ${ruta.nombre || ''}`);
    doc.text(`DIRECCIÓN:   ${ruta.direccion || ''}`);
    doc.text(`PILOTO:      ${ruta.piloto || ''}`);
    doc.text(`LICENCIA:    ${ruta.licencia || ''}`);
    doc.text(`CONDICIÓN:   ${ruta.condicion || ''}`);
    doc.text(`PLACA:       ${ruta.placa || ''}`);

    doc.moveDown(1.2);

    // ---------------------------
    //    TABLA REORDENADA
    // ---------------------------
    const startY = doc.y;
    const rowHeight = 18;

    const colX = {
      cant: 40,
      producto: 100,
      precio: 360,
      total: 430,
      dev: 500
    };

    // Encabezados
    doc.font('Helvetica-Bold').fontSize(10);

    doc.text('Cant.',     colX.cant,     startY, { width: 40, align: 'right' });
    doc.text('Producto',  colX.producto, startY);
    doc.text('Precio',    colX.precio,   startY, { width: 60, align: 'right' });
    doc.text('Total',     colX.total,    startY, { width: 60, align: 'right' });
    doc.text('Dev.',      colX.dev,      startY, { width: 40, align: 'right' });

    // Líneas
    doc.moveTo(40, startY - 3).lineTo(550, startY - 3).stroke();
    doc.moveTo(40, startY + rowHeight - 5).lineTo(550, startY + rowHeight - 5).stroke();

    // Filas
    doc.font('Helvetica');
    let y = startY + rowHeight;

    let totalCant = 0;
    let totalDev = 0;
    let totalQ = 0;

    (ruta.DetallesRuta || []).forEach(det => {
      const nombre   = det.ProductoRuta?.nombre || '';
      const cant     = det.cantidadSalida || 0;
      const dev      = det.cantidadDevuelta || 0;
      const precio   = Number(det.ProductoRuta?.precioVenta || 0);
      const total    = cant * precio;

      totalCant += cant;
      totalDev  += dev;
      totalQ    += total;

      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 50;
      }

      doc.text(String(cant),     colX.cant,     y, { width: 40, align: 'right' });
      doc.text(nombre,           colX.producto, y, { width: 250 });
      doc.text(precio.toFixed(2),colX.precio,   y, { width: 60, align: 'right' });
      doc.text(total.toFixed(2), colX.total,    y, { width: 60, align: 'right' });
      doc.text(String(dev),      colX.dev,      y, { width: 40, align: 'right' });

      y += rowHeight;
    });

    // Línea final
    doc.moveTo(40, y - 5).lineTo(550, y - 5).stroke();

    // Totales
    doc.font('Helvetica-Bold');

    doc.text('Totales:',       colX.producto - 60, y);
    doc.text(String(totalCant), colX.cant,   y, { width: 40, align: 'right' });
    doc.text(totalQ.toFixed(2), colX.total,  y, { width: 60, align: 'right' });
    doc.text(String(totalDev),  colX.dev,    y, { width: 40, align: 'right' });

    doc.end();
  } catch (error) {
    console.error('Error en GET /rutas/:id/pdf:', error);
    return res.status(500).json({ error: 'Error generando PDF de la ruta' });
  }
});


module.exports = router;
