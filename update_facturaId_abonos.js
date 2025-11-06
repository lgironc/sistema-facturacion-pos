// update_facturaId_abonos.js
const { Sequelize } = require('sequelize');
const { MovimientoFinanciero } = require('./src/models');
const sequelize = require('./src/models').sequelize;

async function actualizarFacturaId() {
  try {
    console.log('🔍 Buscando movimientos antiguos sin facturaId...');

    // Buscar movimientos sin facturaId pero con descripción tipo "factura #X"
    const movimientos = await MovimientoFinanciero.findAll({
      where: {
        facturaId: null
      }
    });

    for (const mov of movimientos) {
      const match = mov.descripcion?.match(/factura\s?#(\d+)/i); // Busca #X
      if (match) {
        const facturaId = Number(match[1]);
        mov.facturaId = facturaId;
        await mov.save();
        console.log(`✅ Actualizado: Movimiento ID ${mov.id} => facturaId = ${facturaId}`);
      }
    }

    console.log('✅ Proceso terminado');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error actualizando facturaId:', error);
    process.exit(1);
  }
}

actualizarFacturaId();
