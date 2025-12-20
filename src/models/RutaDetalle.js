// src/models/RutaDetalle.js
const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const RutaDetalle = sequelize.define('RutaDetalle', {
  cantidadSalida: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  cantidadDevuelta: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
});

module.exports = RutaDetalle;
