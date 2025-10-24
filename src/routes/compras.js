const express = require('express');
const router = express.Router();
const { Proveedor, Producto, Compra, CompraDetalle } = require('../models');

// ===========================
// POST - Registrar nueva compra
// ===========================
router.post('/', async (req, res) => {
  try {
    const { proveedorId, productos } = req.body;

    // ✅ Validar que se envíe proveedorId
    if (!proveedorId) {
      return res.status(400).json({ error: 'El proveedorId es obligatorio' });
    }

    // ✅ Verificar que el proveedor exista
    const proveedor = await Proveedor.findByPk(proveedorId);
    if (!proveedor) {
      return res.status(400).json({ error: 'El proveedor no existe' });
    }

    // ✅ Validar que productos sea un arreglo y no esté vacío
    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ error: 'Debe haber al menos un producto en la compra' });
    }

    // ✅ Validación para evitar productos repetidos
    const ids = productos.map(p => p.productoId);
    const productosDuplicados = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (productosDuplicados.length > 0) {
      return res.status(400).json({ error: 'No se permiten productos duplicados en la misma compra' });
    }

    // ✅ Validar que las cantidades sean mayores a 0
    for (const item of productos) {
      if (!item.cantidad || item.cantidad <= 0) {
        return res.status(400).json({ error: 'Cada producto debe tener una cantidad mayor a 0' });
      }
    }

    // ✅ Crear la compra inicialmente con total = 0
    let compra = await Compra.create({
      proveedorId,
      total: 0
    });

    // ✅ Vamos a procesar todos los productos comprados
    let totalCompra = 0;

    for (const item of productos) {
      // Buscar producto
      const producto = await Producto.findByPk(item.productoId);
      if (!producto) {
        return res.status(400).json({ error: `El producto con ID ${item.productoId} no existe` });
      }

      // Crear detalle de la compra
      await CompraDetalle.create({
        compraId: compra.id,
        productoId: item.productoId,
        cantidad: item.cantidad,
        costoUnitario: item.costoUnitario
      });

      // Actualizar stock (+ cantidad comprada)
      producto.stock += item.cantidad;

      // Actualizar costoCompra al último costoUnitario
      producto.costoCompra = item.costoUnitario;

      // Guardar cambios del producto
      await producto.save();

      // Acumular al total
      totalCompra += item.cantidad * item.costoUnitario;
    }

    // ✅ Actualizar total de la compra
    compra.total = totalCompra;
    await compra.save();

    return res.json({ message: 'Compra registrada correctamente', compra });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================
// GET - Obtener historial completo de compras
// ===========================
router.get('/', async (req, res) => {
  try {
    const compras = await Compra.findAll({
      include: [
        {
          model: Proveedor,
          attributes: ['id', 'nombre', 'contacto', 'telefono']
        },
        {
          model: CompraDetalle,
          include: [
            {
              model: Producto,
              attributes: ['id', 'nombre', 'precioVenta']
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']] // Mostrar más recientes primero
    });

    res.json(compras);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
