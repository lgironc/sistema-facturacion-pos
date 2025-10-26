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
// PUT - Editar producto (y sumar stock si aplica)
// ===========================
router.put('/:id', async (req, res) => {
  try {
    let { nombre, costoCompra, precioVenta, stockExtra } = req.body;
stockExtra = parseInt(stockExtra) || 0;


    // Buscar producto
    const producto = await Producto.findByPk(req.params.id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Actualizar campos básicos
    producto.nombre = nombre || producto.nombre;
    producto.costoCompra = costoCompra || producto.costoCompra;
    producto.precioVenta = precioVenta || producto.precioVenta;

    // Sumar stock solo si stockExtra > 0
    if (stockExtra > 0) {
      const stockAnterior = producto.stock;
      producto.stock += stockExtra;

      // Registrar en historial como entrada de reabastecimiento
      await HistorialInventario.create({
        productoId: producto.id,
        cantidad: stockExtra,
        tipo: 'entrada',
        stockFinal: producto.stock,
        descripcion: `Reabastecimiento (Stock anterior: ${stockAnterior})`
      });
    }

    await producto.save();

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
