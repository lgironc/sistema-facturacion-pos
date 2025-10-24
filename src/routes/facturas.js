const express = require('express');
const router = express.Router();
const { Cliente, Producto, Factura, FacturaDetalle } = require('../models');
const PDFDocument = require('pdfkit');

// ===========================
// POST - Registrar nueva factura (venta)
// ===========================
router.post('/', async (req, res) => {
  try {
    const { clienteId, productos } = req.body;

    // ✅ Validar que productos sea un arreglo y no esté vacío
    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ error: 'Debe haber al menos un producto en la factura' });
    }

    // ✅ Validar que las cantidades sean mayores a 0
    for (const item of productos) {
      if (!item.cantidad || item.cantidad <= 0) {
        return res.status(400).json({ error: 'Cada producto debe tener una cantidad mayor a 0' });
      }
    }

    // ✅ Si se envió clienteId, verificar si existe
    let clienteSeleccionado;
    if (clienteId) {
      clienteSeleccionado = await Cliente.findByPk(clienteId);
      if (!clienteSeleccionado) {
        return res.status(400).json({ error: 'El cliente no existe' });
      }
    } else {
      // ✅ Usar cliente "Mostrador" si no se envió ninguno
      const [clienteMostrador] = await Cliente.findOrCreate({
        where: { nombre: 'Mostrador' },
        defaults: { telefono: '', direccion: '' }
      });
      clienteSeleccionado = clienteMostrador;
    }

    // ✅ Crear factura inicialmente con total 0
    let factura = await Factura.create({
      clienteId: clienteSeleccionado.id,
      total: 0
    });

    // ✅ Procesar productos
    let totalFactura = 0;
    for (const item of productos) {
      // Verificar que el producto exista
      const producto = await Producto.findByPk(item.productoId);
      if (!producto) {
        return res.status(400).json({ error: `El producto con ID ${item.productoId} no existe` });
      }

      // Validar stock disponible
      if (producto.stock < item.cantidad) {
        return res.status(400).json({ error: `Stock insuficiente para el producto ${producto.nombre}` });
      }

      // Crear detalle de factura
      await FacturaDetalle.create({
        facturaId: factura.id,
        productoId: item.productoId,
        cantidad: item.cantidad,
        precioUnitario: producto.precioVenta
      });

      // Restar stock
      producto.stock -= item.cantidad;
      await producto.save();

      // Sumar total
      totalFactura += item.cantidad * producto.precioVenta;
    }

    // ✅ Actualizar total de factura
    factura.total = totalFactura;
    await factura.save();




    // ✅ Guardar respaldo en FacturaBackup
   // const { FacturaBackup } = require('../models');
 // facturaOriginalId: factura.id,
  //total: factura.total,
  //fecha: factura.createdAt, // o factura.fecha si lo tienes
  //clienteId: factura.clienteId
 // });


    return res.json({
      message: 'Factura registrada correctamente',
      facturaId: factura.id,
      cliente: clienteSeleccionado.nombre,
      total: totalFactura
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================
// GET - Obtener historial completo de facturas
// ===========================
router.get('/', async (req, res) => {
  try {
    const facturas = await Factura.findAll({
      include: [
        {
          model: Cliente,
          as: 'Cliente', // ✅ Alias correcto
          attributes: ['id', 'nombre', 'telefono']
        },
        {
          model: FacturaDetalle,
          as: 'FacturaDetalles',
          include: [
            {
              model: Producto,
              as: 'Producto', // ✅ Alias correcto
              attributes: ['id', 'nombre', 'precioVenta']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json(facturas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ===========================
// GET - Obtener factura específica por ID
// ===========================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const factura = await Factura.findByPk(id, {
      include: [
        {
          model: Cliente,
          as: 'Cliente', 
          attributes: ['id', 'nombre', 'telefono', 'direccion']
        },
        {
          model: FacturaDetalle,
          as: 'FacturaDetalles',
          include: [
            {
              model: Producto,
              as: 'Producto', // ✅ Alias correcto
              attributes: ['id', 'nombre', 'precioVenta']
            }
          ]
        }
      ]
    });

    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    res.json(factura);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================
// GET - Generar y GUARDAR PDF de factura en carpeta /facturas_pos/
// ===========================
router.get('/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;

    const factura = await Factura.findByPk(id, {
      include: [
        {
          model: Cliente,
          as: 'Cliente',
          attributes: ['nombre', 'telefono', 'direccion']
        },
        {
          model: FacturaDetalle,
          as: 'FacturaDetalles',
          include: [
            {
              model: Producto,
              as: 'Producto',
              attributes: ['nombre', 'precioVenta']
            }
          ]
        }
      ]
    });

    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const numeroFactura = `INT-${String(factura.id).padStart(4, '0')}`;

    // =========================
    // 📁 Verificar carpeta destino
    // =========================
    const fs = require('fs');
    const path = require('path');
    const dirPath = path.join(__dirname, '../../facturas_pos');

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const filePath = path.join(dirPath, `${numeroFactura}.pdf`);

    // =========================
    // 🧾 Crear documento PDF
    // =========================
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });

    // 🖨 Guardarlo en archivo físico
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // ========================
    // ENCABEZADO
    // ========================
    doc.fontSize(20).text('DEPÓSITO LA BENDICIÓN', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).text('Calle Real 2-89A Zona 1, San Miguel Dueñas | Tel: 5667-9720', { align: 'center' });
    doc.text('NIT: 7225652', { align: 'center' });
    doc.moveDown(1);

    // ========================
    // INFO FACTURA + CLIENTE
    // ========================
    doc.fontSize(12)
      .text(`Factura No: ${numeroFactura}`, 50, doc.y, { continued: true })
      .text(`Fecha: ${new Date(factura.fecha).toLocaleDateString()} ${new Date(factura.fecha).toLocaleTimeString()}`, { align: 'right' });

    doc.moveDown(0.5);
    doc.text('Cliente:', { underline: true });
    doc.text(`Nombre: ${factura.Cliente?.nombre || 'Mostrador'}`);
    if (factura.Cliente?.telefono) doc.text(`Teléfono: ${factura.Cliente.telefono}`);
    if (factura.Cliente?.direccion) doc.text(`Dirección: ${factura.Cliente.direccion}`);
    doc.moveDown(1);

    // ========================
    // TABLA DE DETALLES
    // ========================
    doc.font('Helvetica-Bold');
    doc.text('CANT', 50);
    doc.text('PRODUCTO', 100);
    doc.text('P. UNIT', 340, undefined, { width: 80, align: 'right' });
    doc.text('SUBTOTAL', 440, undefined, { width: 80, align: 'right' });

    doc.moveDown(0.3).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica');

    factura.FacturaDetalles.forEach(detalle => {
      const subtotal = detalle.cantidad * detalle.Producto?.precioVenta;
      const y = doc.y;

      doc.text(detalle.cantidad.toString(), 50, y);
      doc.text(detalle.Producto?.nombre || 'N/D', 100, y, { width: 230 });
      doc.text(`Q${detalle.Producto?.precioVenta.toFixed(2)}`, 340, y, { width: 80, align: 'right' });
      doc.text(`Q${subtotal.toFixed(2)}`, 440, y, { width: 80, align: 'right' });

      doc.moveDown(0.8);
    });

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    // ========================
    // TOTAL (NEGRITA A LA DERECHA)
    // ========================
    doc.font('Helvetica-Bold').fontSize(14)
      .text(`TOTAL: Q${factura.total.toFixed(2)}`, 340, doc.y, { width: 180, align: 'right' });

    // ========================
    // PIE DE PÁGINA
    // ========================
    const pageWidth = doc.page.width;
    const margin = 40;
    const printableWidth = pageWidth - margin * 2;
    let footerY = doc.page.height - 120;

    doc.font('Helvetica').fontSize(12)
      .text('¡Gracias por su compra!', margin, footerY, {
        width: printableWidth,
        align: 'center'
      });

    doc.font('Helvetica-Oblique').fontSize(10)
      .text(
        'Factura interna — No válida como FEL hasta su certificación ante SAT',
        margin,
        doc.y + 10,
        { width: printableWidth, align: 'center' }
      );

    doc.end();

    writeStream.on('finish', () => {
      res.sendFile(filePath); // ✅ Devolver PDF directamente al frontend
    });

  } catch (error) {
    console.error("Error generando PDF:", error);
    res.status(500).json({ error: 'Error generando PDF' });
  }
});

// ✅ Endpoint temporal de prueba para confirmar facturas guardadas
router.get('/test/todas', async (req, res) => {
  try {
    const facturas = await Factura.findAll({
      include: [
        {
          model: FacturaDetalle,
          as: 'FacturaDetalles'
        }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(facturas);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});


// ===========================
// EXPORTAR RUTAS
// ===========================
module.exports = router;
