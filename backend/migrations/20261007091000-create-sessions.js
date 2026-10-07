'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Sessions', {
      sid: { type: Sequelize.STRING(36), allowNull: false, primaryKey: true },
      expires: { type: Sequelize.DATE, allowNull: true },
      data: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('Sessions', ['expires'], { name: 'sessions_expires_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Sessions');
  },
};
