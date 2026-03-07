const express = require('express');
const router = express.Router();
const { Cliente, Producto, Factura, FacturaDetalle, CuentaPorCobrar, MovimientoFinanciero, HistorialInventario } = require('../models');
const PDFDocument = require('pdfkit');
const { getPaths } = require('../utils/paths');

const fs = require('fs');
const path = require('path');

function readBusinessConfig() {
  try {
    const { configPath } = getPaths();

    const defaults = {
      nombre: '',
      direccion: '',
      telefono: '',
      nit: ''
    };

    if (!configPath || !fs.existsSync(configPath)) {
      return defaults;
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      nombre: parsed?.negocio?.nombre || defaults.nombre,
      direccion: parsed?.negocio?.direccion || defaults.direccion,
      telefono: parsed?.negocio?.telefono || defaults.telefono,
      nit: parsed?.negocio?.nit || defaults.nit
    };
  } catch (error) {
    console.error(' Error leyendo configuración de negocio:', error);
    return {
      nombre: '',
      direccion: '',
      telefono: '',
      nit: ''
    };
  }
}


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
    let cambio = 0;

if (tipoPago === 'contado') {
  cambio = Number((Number(efectivo) - total).toFixed(2));
  if (cambio < 0) cambio = 0;
}
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
    if (!colsFactura.includes('tipoPago')) console.warn(' Factura no tiene "tipoPago": se guardará sin ese campo');
    if (!colsFactura.includes('efectivo')) console.warn(' Factura no tiene "efectivo": se guardará sin ese campo');

    // 5) Crear factura (sólo inserta campos que existan en la tabla)
const facturaData = {
  clienteId: clienteId ?? null,
  total: Number(total)
};

if (colsFactura.includes('tipoPago')) facturaData.tipoPago = tipoPago;
if (colsFactura.includes('efectivo')) facturaData.efectivo = Number(efectivo);
if (colsFactura.includes('cambio')) facturaData.cambio = Number(cambio);

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
// GET - Ticket 80mm (para impresora térmica)
// ===========================
// ===========================
// GET - Ticket (HTML para imprimir) o PDF (para abrir)
// /facturas/:id/ticket        -> HTML (imprime bien)
// /facturas/:id/ticket?pdf=1  -> PDF (abre con botón)
// ===========================
router.get('/:id/ticket', async (req, res) => {
  try {
    const { id } = req.params;
    const wantPDF = String(req.query.pdf || '') === '1';

    const factura = await Factura.findByPk(id, {
      include: [
        { model: Cliente, as: 'Cliente', attributes: ['nombre', 'nit', 'telefono', 'direccion'] },
        {
          model: FacturaDetalle,
          as: 'FacturaDetalles',
          include: [{ model: Producto, as: 'Producto', attributes: ['nombre', 'precioVenta'] }]
        },
        { model: CuentaPorCobrar, as: 'CuentaPorCobrar' }
      ]
    });

    if (!factura) return res.status(404).send('Factura no encontrada');

    const numeroFactura = `INT-${String(factura.id).padStart(4, '0')}`;
    
    const fecha = new Date(factura.createdAt);
    const fechaStr = `${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString()}`;

    const tipoPago = (factura.tipoPago || 'contado').toLowerCase();
    const total = Number(factura.total || 0);

    const efectivo = Number(factura.efectivo || 0);
    const cambio = Number(factura.cambio ?? Math.max(efectivo - total, 0));

    const cxc = factura.CuentaPorCobrar || null;
    const saldo = cxc ? Number(cxc.saldoPendiente || 0) : 0;
    const abonado = cxc ? Math.max(total - saldo, 0) : 0;

    const negocio = readBusinessConfig();
    function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

    // -------------------------------
    // 1) MODO PDF (para "Abrir Ticket")
    // -------------------------------
    if (wantPDF) {
      const { ticketsPDFDir } = getPaths();
      if (!fs.existsSync(ticketsPDFDir)) fs.mkdirSync(ticketsPDFDir, { recursive: true });

      const filePath = path.join(ticketsPDFDir, `Ticket_${numeroFactura}.pdf`);

      // borrar anterior para evitar PDF corrupto
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }

      const mm = (v) => (v * 72) / 25.4;
      const pageWidth = mm(80);

      // alto dinámico: header+totales+pie (mm) + items
      const detalles = factura.FacturaDetalles || [];
      const baseHeight = mm(95);
      const perItem = mm(12);
      const pageHeight = baseHeight + (detalles.length * perItem);

      const doc = new PDFDocument({ size: [pageWidth, pageHeight], margin: 0 });
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      const fmtQ = (n) => `Q${Number(n || 0).toFixed(2)}`;
      const safeStr = (v) => String(v ?? '').trim();
      const lineChars = 42;

      let y = 2;
      const left = 8;

      // Header
      doc.font('Helvetica-Bold').fontSize(12).text(negocio.nombre || 'Mi negocio', 0, y, { width: pageWidth, align: 'center' }); y += 14;

if (negocio.direccion) {
  doc.font('Helvetica').fontSize(8).text(negocio.direccion, 0, y, { width: pageWidth, align: 'center' });
  y += 10;
}

const lineaNegocio = [
  negocio.telefono ? `Tel: ${negocio.telefono}` : '',
  negocio.nit ? `NIT: ${negocio.nit}` : ''
].filter(Boolean).join(' | ');

if (lineaNegocio) {
  doc.font('Helvetica').fontSize(8).text(lineaNegocio, 0, y, { width: pageWidth, align: 'center' });
  y += 10;
}

      doc.font('Courier').fontSize(8).text('-'.repeat(lineChars), left, y); y += 10;

      doc.text(`Ticket: ${numeroFactura}`, left, y); y += 10;
      doc.text(`Fecha : ${fechaStr}`, left, y); y += 10;
      doc.text(`Cliente: ${safeStr(factura.Cliente?.nombre || 'Mostrador')}`, left, y); y += 10;
      if (factura.Cliente?.nit) { doc.text(`NIT   : ${safeStr(factura.Cliente.nit)}`, left, y); y += 10; }

      doc.text('-'.repeat(lineChars), left, y); y += 10;

      doc.font('Courier-Bold').fontSize(8).text('CANT  DESCRIPCIÓN', left, y); y += 10;
      doc.text('      PRECIO U.                  SUBTOTAL', left, y); y += 10;
      doc.font('Courier').fontSize(8).text('-'.repeat(lineChars), left, y); y += 10;

      // Items 2 líneas
      detalles.forEach((d) => {
        const cant = Number(d.cantidad || 0);
        const nombre = safeStr(d.Producto?.nombre || 'N/D');
        const precio = Number((d.precioUnitario ?? d.precio ?? d.Producto?.precioVenta) || 0);
        const subt = Number((cant * precio).toFixed(2));
        const nombreCorto = nombre.length > 30 ? nombre.slice(0, 29) + '…' : nombre;

        doc.text(String(cant).padStart(3), 10, y);
        doc.text(nombreCorto, 35, y);
        y += 12;

        doc.text(fmtQ(precio), 35, y);
        const subtW = doc.widthOfString(fmtQ(subt));
        doc.text(fmtQ(subt), pageWidth - subtW - 10, y);
        y += 16;
      });

      doc.text('-'.repeat(lineChars), left, y); y += 12;

      doc.font('Courier-Bold').fontSize(9).text('TOTAL', 10, y);
      const totW = doc.widthOfString(fmtQ(total));
      doc.text(fmtQ(total), pageWidth - totW - 10, y);
      y += 14;

      doc.font('Courier').fontSize(8).text('PAGO', 10, y);
      const tp = (tipoPago === 'credito') ? 'CRÉDITO' : 'CONTADO';
      const tpW = doc.widthOfString(tp);
      doc.text(tp, pageWidth - tpW - 10, y);
      y += 12;

      if (tipoPago === 'contado') {
        doc.text('EFECTIVO', 10, y);
        const efW = doc.widthOfString(fmtQ(efectivo));
        doc.text(fmtQ(efectivo), pageWidth - efW - 10, y);
        y += 12;

        doc.text('CAMBIO', 10, y);
        const caW = doc.widthOfString(fmtQ(cambio));
        doc.text(fmtQ(cambio), pageWidth - caW - 10, y);
        y += 12;
      } else {
        doc.text('ABONO', 10, y);
        const abW = doc.widthOfString(fmtQ(abonado));
        doc.text(fmtQ(abonado), pageWidth - abW - 10, y);
        y += 12;

        doc.text('SALDO', 10, y);
        const salW = doc.widthOfString(fmtQ(saldo));
        doc.text(fmtQ(saldo), pageWidth - salW - 10, y);
        y += 12;
      }

      doc.text('-'.repeat(lineChars), left, y); y += 12;

      doc.font('Helvetica-Bold').fontSize(9).text('¡Gracias por su compra!', 0, y, { width: pageWidth, align: 'center' }); y += 12;
      doc.font('Helvetica').fontSize(7).text('Interna — No válida como FEL hasta certificación SAT', 0, y, { width: pageWidth, align: 'center' });

      doc.end();

      res.setHeader('Content-Type', 'application/pdf');

      // usar close (más estable en Windows/OneDrive)
      return writeStream.on('close', () => res.sendFile(filePath));
    }

    // -------------------------------
    // 2) MODO HTML (para imprimir bien)
    // -------------------------------
    let lineas = '';
    (factura.FacturaDetalles || []).forEach(d => {
      const cant = Number(d.cantidad || 0);
      const nombre = String(d.Producto?.nombre || 'N/D');
      const precio = Number((d.precioUnitario ?? d.precio ?? d.Producto?.precioVenta) || 0);
      const subtotal = Number((cant * precio).toFixed(2));
      lineas += `${nombre}\n`;
      lineas += `  ${cant} x Q${precio.toFixed(2)} = Q${subtotal.toFixed(2)}\n`;
    });

    const pagoTexto =
      tipoPago === 'contado'
        ? `Pago: Contado\nEfectivo: Q${efectivo.toFixed(2)}\nCambio: Q${cambio.toFixed(2)}`
        : `Pago: Crédito\nAbono: Q${abonado.toFixed(2)}\nSaldo: Q${saldo.toFixed(2)}`;

    const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Ticket ${numeroFactura}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body {
      width: 80mm;
      font-family: "Courier New", Courier, monospace;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.2;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .wrap { padding: 6px 6px 10px 6px; }
    .center { text-align: center; }
    .hr { border-top: 1px dashed #000; margin: 6px 0; }
    pre { margin: 0; white-space: pre; font-family: inherit; font-size: 13px; font-weight: 600; }
    .right { text-align: right; }
    .small { font-size: 10px; }
    .bold { font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="center bold">${escapeHtml(negocio.nombre || 'Mi negocio')}</div>
${negocio.direccion ? `<div class="center small">${escapeHtml(negocio.direccion)}</div>` : ''}
${(negocio.telefono || negocio.nit)
  ? `<div class="center small">${escapeHtml([
      negocio.telefono ? `Tel: ${negocio.telefono}` : '',
      negocio.nit ? `NIT: ${negocio.nit}` : ''
    ].filter(Boolean).join(' | '))}</div>`
  : ''}
    <div class="hr"></div>
    <div>Ticket: ${numeroFactura}</div>
    <div>Fecha: ${fechaStr}</div>
    <div>Cliente: ${factura.Cliente?.nombre || 'Mostrador'}</div>
    <div class="hr"></div>
    <pre>${lineas}</pre>
    <div class="hr"></div>
    <div class="right bold">TOTAL: Q${total.toFixed(2)}</div>
    <div class="hr"></div>
    <pre>${pagoTexto}</pre>
    <div style="height:6px"></div>
    <div class="center bold">¡Gracias por su compra!</div>
    <div class="center small"><i>Interna — No válida como FEL hasta certificación SAT</i></div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);

  } catch (e) {
    console.error('Error ticket:', e);
    return res.status(500).send('Error generando ticket');
  }
});

// ===========================
// GET - Generar y GUARDAR PDF de factura en carpeta /facturasPDF/
// (TABLA MONOESPACIADA estilo Rutas)
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
        { model: CuentaPorCobrar, as: 'CuentaPorCobrar' }
      ]
    });

    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const numeroFactura = `INT-${String(factura.id).padStart(4, '0')}`;
    const negocio = readBusinessConfig();

    // ✅ RUTA PORTABLE (junto al .exe)
    const { facturasPDFDir } = getPaths();
    if (!facturasPDFDir) throw new Error('facturasPDFDir no definido (getPaths)');

    if (!fs.existsSync(facturasPDFDir)) fs.mkdirSync(facturasPDFDir, { recursive: true });

    const filePath = path.join(facturasPDFDir, `Factura_${numeroFactura}.pdf`);
    if (!filePath) throw new Error('filePath quedó undefined');

    // =========================
    // 🧾 Crear documento PDF
    // =========================
    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // ========================
    // ENCABEZADO
    // ========================
    doc.fontSize(20).text(negocio.nombre || 'Mi negocio', { align: 'center' });
doc.moveDown(0.3);

if (negocio.direccion || negocio.telefono) {
  const linea1 = [negocio.direccion || '', negocio.telefono ? `Tel: ${negocio.telefono}` : '']
    .filter(Boolean)
    .join(' | ');
  if (linea1) doc.fontSize(10).text(linea1, { align: 'center' });
}

if (negocio.nit) {
  doc.text(`NIT: ${negocio.nit}`, { align: 'center' });
}

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

   // =========================
// TABLA MONOESPACIADA (estilo Rutas)
// =========================
doc.font('Courier-Bold').fontSize(10);

const yHeader = doc.y;

doc.text(
  'CANT  PRODUCTO                                              P.UNIT          SUBTOTAL',
  50,
  yHeader
);



// línea debajo del header
doc.moveTo(40, yHeader + 16).lineTo(570, yHeader + 16).stroke();

// arrancar filas
doc.y = yHeader + 26;
doc.font('Courier').fontSize(10);

let totalCalc = 0;

(factura.FacturaDetalles || []).forEach((detalle) => {
  const cant = Number(detalle.cantidad || 0);

  const nombre = String(detalle.Producto?.nombre || 'N/D');

  const precio = Number(
    (detalle.precioUnitario ?? detalle.precio ?? detalle.Producto?.precioVenta) || 0
  );

  const subtotal = Number((cant * precio).toFixed(2));
  totalCalc += subtotal;

  // Anchos: cant(5) + nombre(42) + punit(12) + subtotal(12)
 const fila =
  String(cant).padEnd(5, ' ') +
  nombre.padEnd(48, ' ').slice(0, 48) +
  (`Q${precio.toFixed(2)}`).padStart(16, ' ') +
  (`Q${subtotal.toFixed(2)}`).padStart(16, ' ');


  doc.text(fila, 50, doc.y, { lineBreak: false });
  doc.y += 13;
});

doc.moveDown(0.4);
doc.moveTo(40, doc.y).lineTo(570, doc.y).stroke();
doc.moveDown(0.8);

// TOTAL (usa factura.total como fuente de verdad, pero si quieres comparar: totalCalc)
doc.font('Courier-Bold').fontSize(12);
doc.text(`TOTAL: Q${Number(factura.total || 0).toFixed(2)}`, 350);


    // INFO PAGO
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(11);

    const tipoPago = factura.tipoPago || 'contado';
    let pagoTexto = '';

    if (tipoPago === 'contado') {
      const efectivo = Number(factura.efectivo || 0);
      const cambio = Math.max(efectivo - Number(factura.total || 0), 0);
      pagoTexto = `Tipo de pago: Contado\nEfectivo recibido: Q${efectivo.toFixed(2)}\nCambio: Q${cambio.toFixed(2)}`;
    } else if (tipoPago === 'credito') {
      const cxc = factura.CuentaPorCobrar || {};
      const saldo = Number(cxc.saldoPendiente ?? factura.total ?? 0);
      const abono = Number(factura.total || 0) - saldo;
      pagoTexto = `Tipo de pago: Crédito\nAbono inicial: Q${abono.toFixed(2)}\nSaldo pendiente: Q${saldo.toFixed(2)}`;
    } else {
      pagoTexto = `Tipo de pago: ${tipoPago}`;
    }

    doc.text(pagoTexto);

    // PIE
    const margin = 40;
    const printableWidth = doc.page.width - margin * 2;
    let footerY = doc.page.height - 120;

    doc.font('Helvetica').fontSize(12)
      .text('¡Gracias por su compra!', margin, footerY, { width: printableWidth, align: 'center' });

    doc.font('Helvetica-Oblique').fontSize(10)
      .text('Factura interna — No válida como FEL hasta su certificación ante SAT', margin, doc.y + 10, {
        width: printableWidth,
        align: 'center'
      });

    doc.end();

    writeStream.on('finish', () => {
      // ✅ Esto ya debe funcionar porque filePath ya es válido
      res.sendFile(filePath);
    });

  } catch (error) {
    console.error("❌ Error generando PDF:", error);
    res.status(500).json({ error: 'Error generando PDF', message: error.message });
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

