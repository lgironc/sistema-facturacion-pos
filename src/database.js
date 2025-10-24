const { Sequelize } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../data/database.sqlite'),
  logging: false // Cambiar a true si deseas ver consultas SQL en consola
});

module.exports = sequelize;
