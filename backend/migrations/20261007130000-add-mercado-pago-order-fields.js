'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('appointments', 'mercadoPagoOrderId', {
      type: Sequelize.STRING(64),
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('appointments', 'mercadoPagoIdempotencyKey', {
      type: Sequelize.UUID,
      allowNull: true,
      unique: true,
    });
    await queryInterface.addColumn('appointments', 'mercadoPagoCheckoutUrl', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('appointments', 'paymentInitiationTokenHash', {
      type: Sequelize.STRING(64),
      allowNull: true,
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('appointments', 'paymentInitiationTokenHash');
    await queryInterface.removeColumn('appointments', 'mercadoPagoCheckoutUrl');
    await queryInterface.removeColumn('appointments', 'mercadoPagoIdempotencyKey');
    await queryInterface.removeColumn('appointments', 'mercadoPagoOrderId');
  },
};
