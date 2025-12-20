const express = require('express');
const router = express.Router();
const { Cliente, Producto, Factura, FacturaDetalle, CuentaPorCobrar, MovimientoFinanciero, HistorialInventario } = require('../models');
const PDFDocument = require('pdfkit');




// POST /facturas  — versión estable sin transacciones y con precioUnitario
router.post('/', async (req, res) => {
  try {
    const { clienteId, productos, tipoPago, efectivo = 0, abonoInicial = 0 } = req.body;

  // ⚠️ Regla: para crédito es obligatorio un cliente
    if (tipoPago === 'credito' && !clienteId) {
      return res.status(400).json({
        error: 'Para ventas a crédito debes seleccionar un cliente (clienteId no puede ser null).'
      });
    }

    // 0) Logs de entrada
    console.log('📥 POST /facturas body:', JSON.stringify(req.body, null, 2));

    // 1) Validaciones básicas
    if (!Array.isArray(productos) || productos.length === 0) {
      throw new Error('No hay productos en la factura (productos[])');
    }
    if (!['contado', 'credito'].includes(tipoPago)) {
      throw new Error('tipoPago inválido (use "contado" o "credito")');
    }

    // 2) Normalizar items (precioUnitario y cantidad); fallback a BD si falta precio
    const items = [];
    for (const p of productos) {
      if (!p.productoId) throw new Error('Falta productoId en un item');

      const prod = await Producto.findByPk(p.productoId);
      if (!prod) throw new Error(`Producto ${p.productoId} no encontrado`);

      // Acepta precioUnitario o precio; si no viene, usa precioVenta de BD
      const precioUnitario = Number(
        p.precioUnitario ?? p.precio ?? prod.precioVenta
      );

      if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
        throw new Error(`Precio inválido para ${prod.nombre}`);
      }

      const cantidad = Number(p.cantidad || 1);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        throw new Error(`Cantidad inválida para ${prod.nombre}`);
      }

      if (prod.stock != null && prod.stock < cantidad) {
        throw new Error(`Stock insuficiente para ${prod.nombre} (disp: ${prod.stock})`);
      }

      items.push({
        productoId: prod.id,
        nombre: prod.nombre,
        cantidad,
        precioUnitario,
        stockInicial: prod.stock ?? 0
      });
    }

    // 3) Totales y reglas de pago
    const total = Number(items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0).toFixed(2));
    console.log('Total calculado:', total, 'tipoPago:', tipoPago, 'efectivo:', efectivo, 'abonoInicial:', abonoInicial);

    if (tipoPago === 'contado') {
      if (abonoInicial > 0) throw new Error('En contado no debe haber abono inicial');
      if (!Number.isFinite(total) || total <= 0) throw new Error('Total inválido');
      if (Number(efectivo) < total) throw new Error('Efectivo recibido menor al total');
    } else {
      if (abonoInicial < 0) throw new Error('Abono inicial inválido');
      if (abonoInicial > total) throw new Error('Abono inicial no puede exceder el total');
    }

    // 4) Verifica que el modelo Factura tenga los campos usados
    const colsFactura = Object.keys(Factura.rawAttributes || {});
    console.log('🏷️ Factura columnas:', colsFactura);
    if (!colsFactura.includes('total')) throw new Error('La tabla Factura no tiene columna "total"');
    if (!colsFactura.includes('tipoPago')) console.warn('⚠️ Factura no tiene "tipoPago": se guardará sin ese campo');
    if (!colsFactura.includes('efectivo')) console.warn('⚠️ Factura no tiene "efectivo": se guardará sin ese campo');

    // 5) Crear factura (sólo inserta campos que existan en la tabla)
const facturaData = {
  clienteId: clienteId ?? null,
  total: Number(total)
};
if (colsFactura.includes('tipoPago')) facturaData.tipoPago = tipoPago;
if (colsFactura.includes('efectivo')) facturaData.efectivo = Number(efectivo);

console.log('🧾 facturaData que se insertará:', facturaData, 'typeof total:', typeof facturaData.total);

let nuevaFactura;
try {
  nuevaFactura = await Factura.create(facturaData);
  console.log('✅ Factura creada ID:', nuevaFactura.id, 'total guardado:', nuevaFactura.total);
} catch (e) {
  console.error('❌ Sequelize al crear Factura:', {
    mensaje: e.message,
    fields: e?.errors?.map(er => ({ path: er.path, value: er.value }))
  });
  throw e; // re-lanzamos para que el catch general responda 500
}


// 6) Crear detalles (tu tabla usa 'precioUnitario') y descontar stock + historial
for (const it of items) {
  await FacturaDetalle.create({
    facturaId: nuevaFactura.id,
    productoId: it.productoId,
    cantidad: it.cantidad,
    precioUnitario: Number(it.precioUnitario)
  });

  // Descontar stock de forma atómica a nivel SQL
  await Producto.increment(
    { stock: -it.cantidad },
    { where: { id: it.productoId } }
  );

  // 👇 Registrar movimiento en HistorialInventario como VENTA
  if (HistorialInventario) {
    const stockFinal = (it.stockInicial ?? 0) - it.cantidad;

    await HistorialInventario.create({
      productoId: it.productoId,
      tipo: 'venta',                          // 👈 importante: coincide con ENUM('entrada','venta')
      cantidad: it.cantidad,
      stockFinal,
      descripcion: `Venta factura #${nuevaFactura.id}`
    });
  }
}


// 7) Finanzas / Cuentas por Cobrar
// --------------------------------
if (tipoPago === 'contado') {
  // 💰 Venta de contado: registra ingreso de efectivo
  if (MovimientoFinanciero) {
    await MovimientoFinanciero.create({
      facturaId: nuevaFactura.id,
      tipo: 'ingreso',
      origen: 'venta_contado',         // 👈 así aparece en la pestaña Ingresos y Egresos
      metodo: 'Efectivo',
      monto: total,
      descripcion: `Venta contado factura #${nuevaFactura.id}`
    });
  }

} else {
  // 💳 Venta a crédito: crear cuenta por cobrar
  const saldoPendiente = Number((total - (abonoInicial || 0)).toFixed(2));

  if (CuentaPorCobrar) {
    await CuentaPorCobrar.create({
      clienteId: clienteId ?? null,
      facturaId: nuevaFactura.id,
      totalFactura: total,
      saldoPendiente,
      estado:
        saldoPendiente <= 0
          ? 'pagado'
          : abonoInicial > 0
          ? 'parcial'
          : 'pendiente'
    });
  }

  // 💵 Solo si hay abono inicial se registra ingreso
  if (abonoInicial > 0 && MovimientoFinanciero) {
    await MovimientoFinanciero.create({
      facturaId: nuevaFactura.id,
      tipo: 'ingreso',
      origen: 'abono_credito',      // 👈 coincide con la opción del select del frontend
      monto: abonoInicial,
      descripcion: `Abono inicial a factura #${nuevaFactura.id}`,
      facturaId: nuevaFactura.id
    });
  }
}


// 8) Respuesta OK
return res.status(201).json({ ok: true, facturaId: nuevaFactura.id, total });

  } catch (error) {
    console.error('❌ Error creando factura:', error);
    return res.status(500).json({
      error: 'Error interno al crear factura',
      detalle: error.message
    });
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
    { model: Cliente, as: 'Cliente', attributes: ['id','nombre','telefono','direccion'] },
    { model: FacturaDetalle, as: 'FacturaDetalles',
      include: [{ model: Producto, as: 'Producto', attributes: ['id','nombre','precioVenta'] }]
    },
    { model: CuentaPorCobrar, as: 'CuentaPorCobrar' } // 👈 agrega esto
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
            { model: Producto, as: 'Producto', attributes: ['nombre', 'precioVenta'] }
          ]
        },
        // 👇 CuentaPorCobrar va AQUÍ, no dentro de FacturaDetalles
        { model: CuentaPorCobrar, as: 'CuentaPorCobrar' }
      ]
    });

    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const numeroFactura = `INT-${String(factura.id).padStart(4, '0')}`;

    // =========================
    // 📁 Verificar carpeta destino
    // =========================
   const path = require('path');
const fs = require('fs');

// Usar la misma carpeta que Electron: facturasPDF en la raíz del proyecto
const facturasDir = path.join(__dirname, '..', 'facturasPDF');

if (!fs.existsSync(facturasDir)) {
  fs.mkdirSync(facturasDir, { recursive: true });
}


const filePath = path.join(facturasDir, `Factura_${numeroFactura}.pdf`);

// =========================
// 🧾 Crear documento PDF
// =========================

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
  .text(`Fecha: ${new Date(factura.createdAt).toLocaleDateString()} ${new Date(factura.createdAt).toLocaleTimeString()}`, { align: 'right' });

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
  const precioDet = Number((detalle.precioUnitario ?? detalle.precio ?? detalle.Producto?.precioVenta) || 0);
  const subtotal = Number((detalle.cantidad * precioDet).toFixed(2));
  const y = doc.y;

  doc.text(detalle.cantidad.toString(), 50, y);
  doc.text(detalle.Producto?.nombre || 'N/D', 100, y, { width: 230 });
  doc.text(`Q${precioDet.toFixed(2)}`, 340, y, { width: 80, align: 'right' });
  doc.text(`Q${subtotal.toFixed(2)}`, 440, y, { width: 80, align: 'right' });

  doc.moveDown(0.8);
});

doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
doc.moveDown(1);

// ========================
// TOTAL (NEGRITA A LA DERECHA)
// ========================
doc.font('Helvetica-Bold').fontSize(14)
  .text(`TOTAL: Q${Number(factura.total || 0).toFixed(2)}`, 340, doc.y, { width: 180, align: 'right' });

// ========================
// INFORMACIÓN DE PAGO
// ========================
doc.moveDown(1);
doc.font('Helvetica').fontSize(11);

const tipoPago = factura.tipoPago || 'contado';
let pagoTexto = '';

if (tipoPago === 'contado') {
  const efectivo = Number(factura.efectivo || 0);
  const cambio = Math.max(efectivo - Number(factura.total), 0);
  pagoTexto = ` Tipo de pago: Contado\nEfectivo recibido: Q${efectivo.toFixed(2)}\nCambio: Q${cambio.toFixed(2)}`;
} else if (tipoPago === 'credito') {
  const cxc = factura.CuentaPorCobrar || {};
  const saldo = Number(cxc.saldoPendiente ?? factura.total);
  const abono = Number(factura.total) - saldo;
  pagoTexto = `Tipo de pago: Crédito\nAbono inicial: Q${abono.toFixed(2)}\nSaldo pendiente: Q${saldo.toFixed(2)}`;
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


global.__FACTURAS_ROUTER__ = router;
module.exports = router;

