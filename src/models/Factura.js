// models/Factura.js
const { DataTypes } = require('sequelize');
const sequelize = require('../database'); // ✅ usa tu mismo import

const Factura = sequelize.define('Factura', {
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  total: {
    type: DataTypes.FLOAT,
    allowNull: true,
defaultValue: 0
  },
  tipoPago: {          // ✅ AGREGRADO
    type: DataTypes.ENUM('contado', 'credito'),
    allowNull: false,
    defaultValue: 'contado'
  },
  efectivo: {          // ✅ AGREGADO
    type: DataTypes.FLOAT,
    allowNull: true
  },
  fecha: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'Facturas'
});

module.exports = Factura;
