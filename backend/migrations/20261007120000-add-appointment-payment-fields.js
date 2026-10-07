'use strict';

const allowedPaymentMethods = ['cash', 'mercado_pago'];
const allowedPaymentStatuses = ['pending', 'paid', 'rejected', 'cancelled'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('appointments', 'paymentMethod', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('appointments', 'paymentStatus', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'pending',
    });
    await queryInterface.addConstraint('appointments', {
      fields: ['paymentMethod'],
      type: 'check',
      where: {
        [Sequelize.Op.or]: [
          { paymentMethod: null },
          { paymentMethod: { [Sequelize.Op.in]: allowedPaymentMethods } },
        ],
      },
      name: 'appointments_payment_method_check',
    });
    await queryInterface.addConstraint('appointments', {
      fields: ['paymentStatus'],
      type: 'check',
      where: {
        paymentStatus: {
          [Sequelize.Op.in]: allowedPaymentStatuses,
        },
      },
      name: 'appointments_payment_status_check',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('appointments', 'appointments_payment_status_check');
    await queryInterface.removeConstraint('appointments', 'appointments_payment_method_check');
    await queryInterface.removeColumn('appointments', 'paymentStatus');
    await queryInterface.removeColumn('appointments', 'paymentMethod');
  },
};
