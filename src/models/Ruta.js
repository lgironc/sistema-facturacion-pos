// src/models/Ruta.js
const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Ruta = sequelize.define('Ruta', {
  fecha: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  nombre: {
    type: DataTypes.STRING,
    allowNull: true        // NOMBRE (encabezado)
  },
  direccion: {
    type: DataTypes.STRING,
    allowNull: true        // DIRECCIÓN
  },
  piloto: {
    type: DataTypes.STRING,
    allowNull: true        // PILOTO
  },
  licencia: {
    type: DataTypes.STRING,
    allowNull: true        // LICENCIA
  },
  condicion: {
    type: DataTypes.STRING,
    allowNull: true        // CONDICIÓN
  },
  placa: {
    type: DataTypes.STRING,
    allowNull: true        // PLACA
  }
});

module.exports = Ruta;
