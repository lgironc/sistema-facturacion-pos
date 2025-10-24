const express = require('express');
const router = express.Router();
const { Cliente } = require('../models');

// ===========================
// POST - Crear un nuevo cliente
// ===========================
router.post('/', async (req, res) => {
  try {
    const { nombre, telefono, direccion, nit } = req.body;
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    const cliente = await Cliente.create({ nombre, telefono, direccion, nit });
    res.json({ message: 'Cliente creado con éxito', cliente });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================
// GET - Listar todos los clientes
// ===========================
router.get('/', async (req, res) => {
  try {
    const clientes = await Cliente.findAll();
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================
// GET - Obtener un cliente por ID
// ===========================
router.get('/:id', async (req, res) => {
  try {
    const cliente = await Cliente.findByPk(req.params.id);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json(cliente);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================
// PUT - Actualizar un cliente
// ===========================
router.put('/:id', async (req, res) => {
  try {
    const { nombre, telefono, direccion, nit } = req.body;
    const cliente = await Cliente.findByPk(req.params.id);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    cliente.nombre = nombre || cliente.nombre;
    cliente.telefono = telefono || cliente.telefono;
    cliente.direccion = direccion || cliente.direccion;
    cliente.nit = nit || cliente.nit;
    await cliente.save();

    res.json({ message: 'Cliente actualizado correctamente', cliente });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================
// DELETE - Eliminar un cliente
// ===========================
router.delete('/:id', async (req, res) => {
  try {
    const cliente = await Cliente.findByPk(req.params.id);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    await cliente.destroy();
    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
