const { DataTypes } = require('sequelize');
const sequelize = require('../database');
const Cliente = require('./Cliente');
const Factura = require('./Factura');

const CuentaPorCobrar = sequelize.define('CuentaPorCobrar', {
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Cliente,
      key: 'id'
    }
  },
  facturaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Factura,
      key: 'id'
    }
  },
  totalFactura: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  saldoPendiente: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  estado: {
    type: DataTypes.ENUM('pendiente', 'parcial', 'pagado'),
    defaultValue: 'pendiente'
  },
  fechaRegistro: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'CuentasPorCobrar'
});

module.exports = CuentaPorCobrar;
