const sequelize = require('./src/database');
const { Factura, FacturaDetalle, Producto } = require('./src/models');

async function resetVentas() {
  try {
    console.log('⏳ Limpiando datos de facturas y productos...');

    // Eliminar en orden con truncado (reinicia IDs)
    await FacturaDetalle.destroy({ where: {}, truncate: true });
    await Factura.destroy({ where: {}, truncate: true });
    await Producto.destroy({ where: {}, truncate: true });

    console.log('✅ Facturas, detalles e inventario eliminados completamente y reiniciados.');
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await sequelize.close();
    console.log('✅ Conexión a base cerrada.');
    process.exit();
  }
}

resetVentas();
