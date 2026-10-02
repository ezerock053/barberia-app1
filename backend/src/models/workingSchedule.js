'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class WorkingSchedule extends Model {}

  WorkingSchedule.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      barberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'barbers',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      dayOfWeek: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 0,
          max: 6,
          isInt: true,
        },
      },
      startTime: {
        type: DataTypes.TIME,
        allowNull: false,
      },
      endTime: {
        type: DataTypes.TIME,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'WorkingSchedule',
      tableName: 'working_schedules',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['barberId', 'dayOfWeek'],
          name: 'working_schedules_barber_day_unique',
        },
      ],
    },
  );

  return WorkingSchedule;
};