const sequelize = require('./src/database');

async function borrarTablaBackup() {
  try {
    await sequelize.query('DROP TABLE IF EXISTS Facturas_backup;');
    console.log('✅ Tabla Facturas_backup eliminada correctamente.');
  } catch (err) {
    console.error('❌ Error al eliminar la tabla:', err);
  } finally {
    await sequelize.close();
    process.exit();
  }
}

borrarTablaBackup();
