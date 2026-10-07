'use strict';

const { Sequelize, DataTypes } = require('sequelize');
const config = require('../../config/config')[process.env.NODE_ENV || 'development'];
const Service = require('./service');
const Barber = require('./barber');
const WorkingSchedule = require('./workingSchedule');
const Customer = require('./customer');
const Appointment = require('./appointment');
const AdminUser = require('./adminUser');

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
  Appointment: Appointment(sequelize, DataTypes),
  AdminUser: AdminUser(sequelize, DataTypes),
};

models.Barber.hasMany(models.WorkingSchedule, {
  foreignKey: 'barberId',
  as: 'workingSchedules',
});
models.WorkingSchedule.belongsTo(models.Barber, {
  foreignKey: 'barberId',
  as: 'barber',
});

models.Customer.hasMany(models.Appointment, {
  foreignKey: 'customerId',
  as: 'appointments',
});
models.Appointment.belongsTo(models.Customer, {
  foreignKey: 'customerId',
  as: 'customer',
});
models.Barber.hasMany(models.Appointment, {
  foreignKey: 'barberId',
  as: 'appointments',
});
models.Appointment.belongsTo(models.Barber, {
  foreignKey: 'barberId',
  as: 'barber',
});
models.Service.hasMany(models.Appointment, {
  foreignKey: 'serviceId',
  as: 'appointments',
});
models.Appointment.belongsTo(models.Service, {
  foreignKey: 'serviceId',
  as: 'service',
});

module.exports = { sequelize, Sequelize, ...models };
