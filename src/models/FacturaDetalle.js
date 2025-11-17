// src/models/FacturaDetalle.js
const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const FacturaDetalle = sequelize.define('FacturaDetalle', {
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  precioUnitario: {                // 👈 importante este nombre
    type: DataTypes.FLOAT,
    allowNull: false
  }
});

module.exports = FacturaDetalle;
