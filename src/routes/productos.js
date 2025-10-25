const express = require('express');
const router = express.Router();
const { Producto, HistorialInventario } = require('../models');

// ===========================
// POST - Crear producto (con historial)
// ===========================
router.post('/', async (req, res) => {
  try {
    const { nombre, costoCompra, precioVenta, stock } = req.body;

    if (!nombre || !costoCompra || !precioVenta) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    // Crear producto
    const producto = await Producto.create({
      nombre,
      costoCompra,
      precioVenta,
      stock: stock || 0
    });

    // 🔍 Debug: verificar que entra aquí
console.log('🟢 Registrando historial de producto:', producto.id, stock);

   // ✅ Registrar el movimiento en el historial (entrada inicial)
    await HistorialInventario.create({
      productoId: producto.id,
      cantidad: stock || 0,
      tipo: 'entrada',
      stockFinal: producto.stock,
      descripcion: 'Registro inicial'
    });

    res.json(producto);
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================
// PUT - Actualizar producto
// ===========================
router.put('/:id', async (req, res) => {
  try {
    const { nombre, costoCompra, precioVenta, stock } = req.body;

    const producto = await Producto.findByPk(req.params.id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const stockAnterior = producto.stock;
    let diferenciaStock = 0;

    if (stock !== undefined) {
      diferenciaStock = stock - stockAnterior;
    }

    producto.nombre = nombre || producto.nombre;
    producto.costoCompra = costoCompra || producto.costoCompra;
    producto.precioVenta = precioVenta || producto.precioVenta;
    producto.stock = stock !== undefined ? stock : producto.stock;
    await producto.save();

    // Registrar historial solo si se sumó stock
    if (diferenciaStock > 0) {
      await HistorialInventario.create({
        productoId: producto.id,
        cantidad: diferenciaStock
      });
    }

    res.json({ message: 'Producto actualizado correctamente', producto });
  } catch (error) {
    console.error('Error actualizando producto:', error);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

// ===========================
// GET - Listar productos
// ===========================
router.get('/', async (req, res) => {
  try {
    const productos = await Producto.findAll();
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================
// INACTIVAR - Marcar producto como inactivo
// ===========================
router.delete('/:id', async (req, res) => {
  try {
    const producto = await Producto.findByPk(req.params.id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // En lugar de eliminar, lo marcamos como inactivo
    producto.activo = false;
    await producto.save();

    res.json({ message: 'Producto marcado como inactivo correctamente' });
  } catch (error) {
    console.error('Error al inactivar producto:', error); // <--- para debug
    res.status(500).json({ error: error.message });
  }
});

// ===========================
// REACTIVAR PRODUCTO
// ===========================
router.patch('/:id/reactivar', async (req, res) => {
  try {
    const producto = await Producto.findByPk(req.params.id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    producto.activo = true;
    await producto.save();

    res.json({ message: 'Producto reactivado correctamente' });
  } catch (error) {
    console.error('Error al reactivar producto:', error);
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;
