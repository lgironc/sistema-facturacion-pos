const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Cliente = sequelize.define('Cliente', {
  nombre: {
    type: DataTypes.STRING,
    allowNull: false
  },
  telefono: {
    type: DataTypes.STRING,
    allowNull: true
  },
  direccion: {
    type: DataTypes.STRING,
    allowNull: true
  },
  nit: {
  type: DataTypes.STRING,
  allowNull: true
}

});

module.exports = Cliente;
