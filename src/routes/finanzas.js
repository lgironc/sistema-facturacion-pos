const express = require('express');
const router = express.Router();
const { MovimientoFinanciero } = require('../models');

// POST /finanzas  (movimiento manual desde la pestaña)
router.post('/', async (req, res) => {
  try {
    const { tipo, monto, descripcion } = req.body;

    if (!['ingreso', 'egreso'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }
    if (!monto || Number(monto) <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }

    const mov = await MovimientoFinanciero.create({
      tipo,
      monto: Number(monto),
      descripcion: descripcion || null,
      origen: 'manual'   // 👈 opcional
    });

    res.status(201).json(mov);
  } catch (err) {
    console.error('Error guardando movimiento:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /finanzas  (listar TODO)
router.get('/', async (req, res) => {
  try {
    const movimientos = await MovimientoFinanciero.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(movimientos);
  } catch (err) {
    console.error('Error leyendo movimientos:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
