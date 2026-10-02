'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('working_schedules', {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
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
      dayOfWeek: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      startTime: {
        type: Sequelize.TIME,
        allowNull: false,
      },
      endTime: {
        type: Sequelize.TIME,
        allowNull: false,
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

    await queryInterface.addConstraint('working_schedules', {
      fields: ['dayOfWeek'],
      type: 'check',
      where: {
        dayOfWeek: {
          [Sequelize.Op.gte]: 0,
          [Sequelize.Op.lte]: 6,
        },
      },
      name: 'working_schedules_day_of_week_check',
    });

    await queryInterface.addConstraint('working_schedules', {
      fields: ['barberId', 'dayOfWeek'],
      type: 'unique',
      name: 'working_schedules_barber_day_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('working_schedules');
  },
};