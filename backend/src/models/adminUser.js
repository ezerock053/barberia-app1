'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AdminUser extends Model {}

  AdminUser.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(60), allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    sequelize,
    modelName: 'AdminUser',
    tableName: 'admin_users',
    timestamps: true,
    defaultScope: { attributes: { exclude: ['passwordHash'] } },
    scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
  });

  return AdminUser;
};
