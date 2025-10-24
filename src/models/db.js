const { Sequelize } = require('sequelize');
const path = require('path');

// ✅ Base de datos en archivo local SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../database.sqlite'),
  logging: false // Puedes poner true para ver queries en consola
});

module.exports = sequelize;
