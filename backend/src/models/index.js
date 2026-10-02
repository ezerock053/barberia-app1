'use strict';

const { Sequelize, DataTypes } = require('sequelize');
const config = require('../../config/config')[process.env.NODE_ENV || 'development'];
const Service = require('./service');
const Barber = require('./barber');
const WorkingSchedule = require('./workingSchedule');
const Customer = require('./customer');

const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  port: config.port,
  dialect: config.dialect,
  logging: false,
});

const models = {
  Service: Service(sequelize, DataTypes),
  Barber: Barber(sequelize, DataTypes),
  WorkingSchedule: WorkingSchedule(sequelize, DataTypes),
  Customer: Customer(sequelize, DataTypes),
};

models.Barber.hasMany(models.WorkingSchedule, {
  foreignKey: 'barberId',
  as: 'workingSchedules',
});
models.WorkingSchedule.belongsTo(models.Barber, {
  foreignKey: 'barberId',
  as: 'barber',
});

module.exports = { sequelize, Sequelize, ...models };