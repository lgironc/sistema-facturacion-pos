const express = require('express');
const router = express.Router();
const { HistorialInventario, Producto } = require('../models');

// ===========================
// GET - Historial completo
// ===========================
router.get('/', async (req, res) => {
  try {
    const historial = await HistorialInventario.findAll({
      include: [
        {
          model: Producto,
          as: 'Producto',
          attributes: ['nombre']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json(historial);
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

module.exports = router;
