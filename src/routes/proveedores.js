const express = require('express');
const router = express.Router();
const { Proveedor } = require('../models');

// Crear proveedor
router.post('/', async (req, res) => {
  try {
    const proveedor = await Proveedor.create(req.body);
    res.json({ message: 'Proveedor creado con éxito', proveedor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar proveedores
router.get('/', async (req, res) => {
  try {
    const proveedores = await Proveedor.findAll();
    res.json(proveedores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
