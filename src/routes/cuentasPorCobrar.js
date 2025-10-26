const express = require('express');
const router = express.Router();
const { CuentaPorCobrar, MovimientoFinanciero } = require('../models');

// ===========================
// POST - Registrar un abono (cobro de crédito)
// ===========================
router.post('/abonar', async (req, res) => {
  try {
    const { cuentaId, monto, descripcion } = req.body;

    if (!cuentaId || !monto || monto <= 0) {
      return res.status(400).json({ error: 'Cuenta y monto válidos son obligatorios' });
    }

    // Buscar la cuenta por cobrar
    const cuenta = await CuentaPorCobrar.findByPk(cuentaId);
    if (!cuenta) {
      return res.status(404).json({ error: 'Cuenta por cobrar no encontrada' });
    }

    // Registrar movimiento financiero
    await MovimientoFinanciero.create({
      tipo: 'cobro_credito',
      monto,
      descripcion: descripcion || `Abono a factura #${cuenta.facturaId}`
    });

    // Restar saldo
    cuenta.saldoPendiente -= monto;

    // Actualizar estado
    if (cuenta.saldoPendiente <= 0) {
      cuenta.saldoPendiente = 0;
      cuenta.estado = 'pagado';
    } else {
      cuenta.estado = 'parcial';
    }

    await cuenta.save();

    res.json({ ok: true, cuenta });

  } catch (error) {
    console.error('Error registrando abono:', error);
    res.status(500).json({ error: 'Error al registrar abono de crédito' });
  }
});

// ===========================
// GET - Obtener todas las cuentas por cobrar
// ===========================
router.get('/', async (req, res) => {
  try {
    const cuentas = await CuentaPorCobrar.findAll({
      include: ['Cliente', 'Factura'],
      order: [['createdAt', 'DESC']]
    });
    res.json(cuentas);
  } catch (error) {
    console.error('Error obteniendo cuentas por cobrar:', error);
    res.status(500).json({ error: 'Error al obtener cuentas por cobrar' });
  }
});


module.exports = router;
