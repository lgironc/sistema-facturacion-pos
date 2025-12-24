// src/routes/finanzas.js
const express = require('express');
const router = express.Router();
const { MovimientoFinanciero } = require('../models');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getPaths } = require('../utils/paths');


// =====================================================
// 📄 CIERRE DE CAJA - GENERAR PDF
// GET /finanzas/cierre/pdf?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Si no se envían fechas, toma SOLO el día de hoy
// =====================================================
router.get('/cierre/pdf', async (req, res) => {
  try {
    let { desde, hasta } = req.query;

    const hoy = new Date();
    const hoyStr = hoy.toISOString().slice(0, 10); // YYYY-MM-DD

    if (!desde) desde = hoyStr;
    if (!hasta) hasta = hoyStr;

    const inicio = new Date(`${desde}T00:00:00`);
    const fin = new Date(`${hasta}T23:59:59`);

    // 🔹 Traer movimientos en el rango
    const movimientos = await MovimientoFinanciero.findAll({
      where: {
        createdAt: {
          [Op.between]: [inicio, fin]
        }
      },
      order: [['createdAt', 'ASC']]
    });

    // 🔹 Calcular totales
    let totalIngresos = 0;
    let totalEgresos = 0;

    movimientos.forEach(m => {
      const monto = Number(m.monto || 0);
      if (m.tipo === 'egreso') {
        totalEgresos += monto;
      } else {
        // Todo lo que no sea "egreso" lo contamos como ingreso
        totalIngresos += monto;
      }
    });

    const saldo = totalIngresos - totalEgresos;

    // =====================================================
    // 📁 Carpeta donde se guardarán los cierres
    // =====================================================
   const { cierresPDFDir } = getPaths();
if (!cierresPDFDir) throw new Error('cierresPDFDir no definido (getPaths)');

if (!fs.existsSync(cierresPDFDir)) {
  fs.mkdirSync(cierresPDFDir, { recursive: true });
}

const nombreArchivo = `Cierre_${desde}_a_${hasta}.pdf`;
const filePath = path.join(cierresPDFDir, nombreArchivo);


    // =====================================================
    // 🧾 Crear PDF
    // =====================================================
    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Encabezado
    doc
      .fontSize(18)
      .text('CIERRE DE CAJA', { align: 'center' })
      .moveDown(0.5);

    doc
      .fontSize(10)
      .text('Sistema de Facturación POS - Depósito La Bendición', { align: 'center' })
      .moveDown(1);

    doc
      .fontSize(11)
      .text(`Rango de fechas: ${desde} a ${hasta}`)
      .text(
        `Generado: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`
      )
      .moveDown(1.5);

    // Resumen
    doc
      .fontSize(12)
      .text(`Total ingresos: Q${totalIngresos.toFixed(2)}`)
      .text(`Total egresos:  Q${totalEgresos.toFixed(2)}`)
      .text(`Saldo neto:     Q${saldo.toFixed(2)}`)
      .moveDown(1.5);

    // Detalle de movimientos
    doc.fontSize(13).text('Detalle de movimientos', { underline: true }).moveDown(0.5);
    doc.fontSize(10);

    if (!movimientos.length) {
      doc.text('No hay movimientos en el rango seleccionado.');
    } else {
      movimientos.forEach(m => {
        const fecha =
          new Date(m.createdAt).toLocaleDateString() +
          ' ' +
          new Date(m.createdAt).toLocaleTimeString();

        const esEgreso = m.tipo === 'egreso';
        const signo = esEgreso ? '-' : '+';
        const linea = `${fecha} - [${m.tipo.toUpperCase()}] ${signo}Q${Number(
          m.monto || 0
        ).toFixed(2)} - ${m.descripcion || ''}`;

        doc.text(linea);
      });
    }

    // Pie de página
    doc.moveDown(2);
    doc.fontSize(9).text('Este cierre es solo de uso interno.', { align: 'center' });

    doc.end();

    writeStream.on('finish', () => {
      return res.sendFile(filePath);
    });

    writeStream.on('error', err => {
      console.error('Error escribiendo PDF de cierre:', err);
      return res
        .status(500)
        .json({ error: 'Error generando PDF de cierre de caja' });
    });
  } catch (error) {
    console.error('Error en /finanzas/cierre/pdf:', error);
    return res
      .status(500)
      .json({ error: 'Error interno generando cierre de caja' });
  }
});

// =====================================================
// 🔎 LISTAR MOVIMIENTOS
// GET /finanzas           → todos
// GET /finanzas?facturaId=XX → solo de esa factura (para historial de abonos)
// =====================================================
router.get('/', async (req, res) => {
  try {
    const { facturaId } = req.query;
    const where = {};

    if (facturaId) {
      where.facturaId = facturaId;
    }

    const movimientos = await MovimientoFinanciero.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    res.json(movimientos);
  } catch (error) {
    console.error('Error listando movimientos:', error);
    res.status(500).json({ error: 'Error al obtener movimientos financieros' });
  }
});

// =====================================================
// 💾 CREAR MOVIMIENTO MANUAL (Ingreso / Egreso)
// POST /finanzas
// body: { tipo: 'ingreso'|'egreso', monto, descripcion }
// =====================================================
router.post('/', async (req, res) => {
  try {
    const { tipo, monto, descripcion } = req.body;

    if (!['ingreso', 'egreso'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }

    const mov = await MovimientoFinanciero.create({
      tipo,
      monto: montoNum,
      descripcion: descripcion || null
    });

    res.status(201).json(mov);
  } catch (error) {
    console.error('Error creando movimiento:', error);
    res.status(500).json({ error: 'Error al crear movimiento financiero' });
  }
});

module.exports = router;
