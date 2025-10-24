const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Compra = sequelize.define('Compra', {
  total: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  fecha: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

module.exports = Compra;
