'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Appointment extends Model {}

  Appointment.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
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
      serviceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'services',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      startAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: {
          isIn: [['pending', 'confirmed', 'completed', 'cancelled', 'no_show']],
        },
      },
      paymentMethod: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [['cash', 'mercado_pago']],
        },
      },
      paymentStatus: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: {
          isIn: [['pending', 'paid', 'rejected', 'cancelled']],
        },
      },
      serviceName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      servicePrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      notes: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Appointment',
      tableName: 'appointments',
      timestamps: true,
    },
  );

  return Appointment;
};
