const express = require('express');
const router = express.Router();
const { MovimientoFinanciero } = require('../models');

// ===========================
// POST - Registrar movimiento manual (ingreso o egreso)
// ===========================
router.post('/', async (req, res) => {
  try {
    const { tipo, monto, descripcion } = req.body;

    if (!tipo || !monto) {
      return res.status(400).json({ error: 'Tipo y monto son obligatorios' });
    }

    const movimiento = await MovimientoFinanciero.create({
      tipo,
      monto,
      descripcion: descripcion || ''
    });

    res.json({ ok: true, movimiento });
  } catch (error) {
    console.error('Error creando movimiento financiero:', error);
    res.status(500).json({ error: 'Error al crear movimiento financiero' });
  }
});

// ===========================
// GET - Obtener todos los movimientos
// ===========================
router.get('/', async (req, res) => {
  try {
    const movimientos = await MovimientoFinanciero.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(movimientos);
  } catch (error) {
    console.error('Error obteniendo movimientos financieros:', error);
    res.status(500).json({ error: 'Error al obtener movimientos financieros' });
  }
});

module.exports = router;
