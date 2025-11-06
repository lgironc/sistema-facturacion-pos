const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const MovimientoFinanciero = sequelize.define('MovimientoFinanciero', {
  tipo: {
    type: DataTypes.ENUM('venta', 'cobro_credito', 'egreso'),
    allowNull: false
  },
  monto: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  descripcion: {
    type: DataTypes.STRING,
    allowNull: true
  }, 
  facturaId: {
  type: DataTypes.INTEGER,
  allowNull: true,
  references: {
    model: 'Facturas',
    key: 'id'
  }
}

}, {
  tableName: 'MovimientosFinancieros'
});

module.exports = MovimientoFinanciero;
