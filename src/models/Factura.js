const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Factura = sequelize.define('Factura', {
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  total: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  fecha: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

module.exports = Factura;
