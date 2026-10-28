'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, D) => {
  class Charge extends Model {}
  Charge.init({
    id: { type: D.INTEGER, primaryKey: true, autoIncrement: true },
    appointmentId: { type: D.INTEGER, allowNull: false, unique: true },
    amount: { type: D.DECIMAL(10, 2), allowNull: false },
    expectedAmount: { type: D.DECIMAL(10, 2), allowNull: false },
    currency: { type: D.STRING(3), allowNull: false, defaultValue: 'ARS', validate: { isIn: [['ARS']] } },
    method: { type: D.STRING(20), allowNull: false, validate: { isIn: [['cash', 'transfer', 'mercado_pago']] } },
    paidAt: { type: D.DATE, allowNull: false },
    dateSource: { type: D.STRING(20), allowNull: false },
    recordedByUserId: { type: D.INTEGER, allowNull: true },
    providerOrderId: { type: D.STRING(64), allowNull: true, unique: true },
  }, { sequelize, modelName: 'Charge', tableName: 'charges', timestamps: true });
  return Charge;
};
