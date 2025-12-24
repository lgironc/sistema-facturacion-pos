const { Sequelize } = require('sequelize');
const { getPaths } = require('./utils/paths');

const { dbPath } = getPaths();

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: false
});

module.exports = sequelize;
