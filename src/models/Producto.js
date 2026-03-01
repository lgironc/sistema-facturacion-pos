const { DataTypes } = require('sequelize');
const sequelize = require('../database');

const Producto = sequelize.define('Producto', {
  nombre: {
    type: DataTypes.STRING,
    allowNull: false,
    trim: true,
    unique: true
  },
  costoCompra: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      min: 0
    }
  },
  precioVenta: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      min: 0
    }
  },
  stock: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0
    }
  }, 
  fechaIngreso: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW // Guarda fecha automáticamente
  }, activo: {
  type: DataTypes.BOOLEAN,
  defaultValue: true
},
barcode: {
  type: DataTypes.STRING,
  allowNull: true,
  unique: true
},


},


{
  tableName: 'Productos', // Asegura el nombre de tabla
  timestamps: true,       // createdAt y updatedAt activados (buenas prácticas)
});

module.exports = Producto;
