// src/models/RutaDetalle.js
const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const RutaDetalle = sequelize.define('RutaDetalle', {
  cantidadSalida: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  cantidadDevuelta: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  // ✅ Congelar precio para la ruta (histórico)
  precioVenta: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 }
});

module.exports = RutaDetalle;