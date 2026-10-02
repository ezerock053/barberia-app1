'use strict';

const allowedStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('appointments', {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },
      customerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      barberId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'barbers',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      serviceId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'services',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      startAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      endAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'pending',
      },
      serviceName: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      servicePrice: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      notes: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addConstraint('appointments', {
      fields: ['status'],
      type: 'check',
      where: {
        status: {
          [Sequelize.Op.in]: allowedStatuses,
        },
      },
      name: 'appointments_status_check',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('appointments');
  },
};