'use strict';

async function replacePaymentMethods(q, S, methods) {
  const [constraints] = await q.sequelize.query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND CONSTRAINT_NAME = 'appointments_payment_method_check'");
  // Sequelize 6's MySQL removeConstraint treats CHECKs as indexes.
  if (constraints.length) await q.sequelize.query('ALTER TABLE `appointments` DROP CHECK `appointments_payment_method_check`');
  await q.addConstraint('appointments', { name: 'appointments_payment_method_check', type: 'check', fields: ['paymentMethod'], where: {
    [S.Op.or]: [{ paymentMethod: null }, { paymentMethod: { [S.Op.in]: methods } }],
  } });
}

module.exports = {
  async up(q, S) {
    const columns = await q.describeTable('appointments');
    if (!columns.completedAt) await q.addColumn('appointments', 'completedAt', { type: S.DATE, allowNull: true });
    if (!columns.completedByUserId) await q.addColumn('appointments', 'completedByUserId', {
      type: S.INTEGER, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'RESTRICT', onDelete: 'RESTRICT',
    });
    const tables = await q.showAllTables();
    if (!tables.includes('charges')) {
      await q.createTable('charges', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        appointmentId: { type: S.INTEGER, allowNull: false, unique: true, references: { model: 'appointments', key: 'id' }, onUpdate: 'RESTRICT', onDelete: 'RESTRICT' },
        amount: { type: S.DECIMAL(10, 2), allowNull: false },
        expectedAmount: { type: S.DECIMAL(10, 2), allowNull: false },
        currency: { type: S.STRING(3), allowNull: false, defaultValue: 'ARS' },
        method: { type: S.STRING(20), allowNull: false },
        paidAt: { type: S.DATE, allowNull: false },
        dateSource: { type: S.STRING(20), allowNull: false },
        recordedByUserId: { type: S.INTEGER, allowNull: true, references: { model: 'admin_users', key: 'id' }, onUpdate: 'RESTRICT', onDelete: 'RESTRICT' },
        providerOrderId: { type: S.STRING(64), allowNull: true, unique: true },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false },
      });
      await q.addConstraint('charges', { name: 'charges_values_check', type: 'check', fields: ['amount', 'expectedAmount', 'currency', 'method'], where: {
        amount: { [S.Op.gt]: 0 }, expectedAmount: { [S.Op.gt]: 0 }, currency: 'ARS', method: { [S.Op.in]: ['cash', 'transfer', 'mercado_pago'] },
      } });
    }
    // Preserve all historical values; only expand the allowed methods.
    await replacePaymentMethods(q, S, ['cash', 'transfer', 'mercado_pago']);
  },
  async down(q, S) {
    const [rows] = await q.sequelize.query("SELECT COUNT(*) AS count FROM charges");
    const [transfers] = await q.sequelize.query("SELECT COUNT(*) AS count FROM appointments WHERE paymentMethod = 'transfer'");
    const [completed] = await q.sequelize.query('SELECT COUNT(*) AS count FROM appointments WHERE completedAt IS NOT NULL');
    if (Number(rows[0].count) || Number(transfers[0].count) || Number(completed[0].count)) throw new Error('No se puede revertir una migración con cobros o finalizaciones registrados.');
    await replacePaymentMethods(q, S, ['cash', 'mercado_pago']);
    await q.dropTable('charges');
    await q.removeColumn('appointments', 'completedByUserId');
    await q.removeColumn('appointments', 'completedAt');
  },
};
