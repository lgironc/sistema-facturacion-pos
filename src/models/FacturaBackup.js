const { DataTypes } = require('sequelize');
const sequelize = require('./db'); // ✅ Ruta corregida

const FacturaBackup = sequelize.define('FacturaBackup', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  facturaOriginalId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  total: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  fecha: {
    type: DataTypes.DATE,
    allowNull: false
  },
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'Facturas_backup',
  timestamps: true
});

module.exports = FacturaBackup;
