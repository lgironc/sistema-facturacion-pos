const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Proveedor = sequelize.define('Proveedor', {
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  contacto: {
    type: DataTypes.STRING,
    allowNull: true
  },
  telefono: {
    type: DataTypes.STRING,
    allowNull: true
  },
  direccion: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

module.exports = Proveedor;
