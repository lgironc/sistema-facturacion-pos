const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const HistorialInventario = sequelize.define('HistorialInventario', {
  productoId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  cantidad: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  fechaIngreso: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  descripcion: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'HistorialInventario'
});

module.exports = HistorialInventario;
