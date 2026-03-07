// src/models/Ruta.js
const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Ruta = sequelize.define('Ruta', {
  fecha: { type: DataTypes.DATEONLY, allowNull: false },

  nombre: { type: DataTypes.STRING, allowNull: true },
  direccion: { type: DataTypes.STRING, allowNull: true },
  piloto: { type: DataTypes.STRING, allowNull: true },
  licencia: { type: DataTypes.STRING, allowNull: true },
  condicion: { type: DataTypes.STRING, allowNull: true },
  placa: { type: DataTypes.STRING, allowNull: true },

  // ✅ YA lo usas en POST /rutas
  observaciones: { type: DataTypes.TEXT, allowNull: true },

  // ✅ control de flujo
  estado: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'ABIERTA' // ABIERTA | EN_RUTA | LIQUIDADA
  },

  // ✅ liquidación
  totalEsperado: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
  totalCobrado:  { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
  diferencia:    { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
  fechaLiquidacion: { type: DataTypes.DATE, allowNull: true }
});

module.exports = Ruta;