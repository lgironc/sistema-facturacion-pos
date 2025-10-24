const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const CompraDetalle = sequelize.define('CompraDetalle', {
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  costoUnitario: {
    type: DataTypes.FLOAT,
    allowNull: false
  }
});

module.exports = CompraDetalle;
