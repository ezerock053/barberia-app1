'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Barber extends Model {}

  Barber.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      image: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'Barber',
      tableName: 'barbers',
      timestamps: true,
    },
  );

  return Barber;
};