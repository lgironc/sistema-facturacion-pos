const express = require('express');
const router = express.Router();
const { Cliente, Producto, Factura, FacturaDetalle, HistorialInventario } = require('../models');
const PDFDocument = require('pdfkit');
const { start } = require('repl');



router.post('/', async (req, res) => {
  try {
    const { clienteId, productos, tipoPago, efectivo = 0, abonoInicial = 0 } = req.body;

    console.log('🧾 Datos recibidos:', { clienteId, tipoPago, efectivo, abonoInicial, productos });

    if (!productos || !productos.length) {
      return res.status(400).json({ error: 'No hay productos en la factura' });
    }

    // Calcular total de la factura
    const totalFactura = productos.reduce((sum, p) => {
      const precio = parseFloat(p.precio || 0);
      return sum + (p.cantidad * precio);
    }, 0);

    console.log('💰 Total calculado:', totalFactura);

    // Crear factura
    const nuevaFactura = await Factura.create({
      clienteId,
      total: totalFactura,
      tipoPago,
      efectivo
    });

    // Crear detalles
    for (const p of productos) {
      await FacturaDetalle.create({
        facturaId: nuevaFactura.id,
        productoId: p.productoId,
        cantidad: p.cantidad,
        precio: p.precio
      });

      // Actualizar stock
      const prod = await Producto.findByPk(p.productoId);
      if (prod) {
        prod.stock -= p.cantidad;
        await prod.save();
      }
    }

    // Si es crédito
    if (tipoPago === 'credito') {
      const saldoPendiente = totalFactura - abonoInicial;

      console.log('📘 Creando cuenta por cobrar con saldo:', saldoPendiente);

      await CuentaPorCobrar.create({
        clienteId,
        facturaId: nuevaFactura.id,
        totalFactura,
        saldoPendiente,
        estado: saldoPendiente <= 0 ? 'pagado' : (abonoInicial > 0 ? 'parcial' : 'pendiente')
      });

      if (abonoInicial > 0) {
        await MovimientoFinanciero.create({
          tipo: 'cobro_credito',
          monto: abonoInicial,
          descripcion: `Abono inicial a factura #${nuevaFactura.id}`,
          facturaId: nuevaFactura.id
        });
      }
    }

    res.json({ ok: true, facturaId: nuevaFactura.id });

  } catch (error) {
    console.error('❌ Error creando factura:', error);
    res.status(500).json({ error: 'Error interno al crear factura', detalle: error.message });
  }
});





    // ✅ Guardar respaldo en FacturaBackup
   // const { FacturaBackup } = require('../models');
 // facturaOriginalId: factura.id,
  //total: factura.total,
  //fecha: factura.createdAt, // o factura.fecha si lo tienes
  //clienteId: factura.clienteId
 // });


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
// INFORMACIÓN DE PAGO
// ========================
doc.moveDown(1);
doc.font('Helvetica').fontSize(11);

const tipoPago = factura.tipoPago || 'contado';
let pagoTexto = '';

if (tipoPago === 'contado') {
  const efectivo = parseFloat(factura.efectivo || 0);
  const cambio = Math.max(efectivo - factura.total, 0);
  pagoTexto = `💵 Tipo de pago: Contado\nEfectivo recibido: Q${efectivo.toFixed(2)}\nCambio: Q${cambio.toFixed(2)}`;
} else if (tipoPago === 'credito') {
  const cuenta = factura.CuentaPorCobrar || {};
  const abono = factura.total - (cuenta.saldoPendiente || 0);
  const saldo = cuenta.saldoPendiente ?? factura.total;
  pagoTexto = `💳 Tipo de pago: Crédito\nAbono inicial: Q${abono.toFixed(2)}\nSaldo pendiente: Q${saldo.toFixed(2)}`;
} else {
  pagoTexto = `Tipo de pago: ${tipoPago}`;
}

doc.text(pagoTexto, { align: 'left' });

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
