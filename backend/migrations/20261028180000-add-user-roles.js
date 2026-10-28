'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // MySQL DDL auto-commits. Allow resuming if an earlier step failed.
    const columns = await queryInterface.describeTable('admin_users');
    if (!columns.role) await queryInterface.addColumn('admin_users', 'role', {
      type: Sequelize.STRING(16), allowNull: false, defaultValue: 'owner',
    });
    if (!columns.barberId) await queryInterface.addColumn('admin_users', 'barberId', {
      type: Sequelize.INTEGER, allowNull: true, unique: true,
    });
    const references = await queryInterface.getForeignKeyReferencesForTable('admin_users');
    for (const reference of references.filter((entry) => entry.columnName === 'barberId')) {
      await queryInterface.removeConstraint('admin_users', reference.constraintName);
    }
    // MySQL forbids combining a CHECK on this column with ON UPDATE CASCADE.
    await queryInterface.addConstraint('admin_users', {
      name: 'admin_users_barber_fk', type: 'foreign key', fields: ['barberId'],
      references: { table: 'barbers', field: 'id' }, onUpdate: 'RESTRICT', onDelete: 'RESTRICT',
    });
    await queryInterface.addConstraint('admin_users', {
      name: 'admin_users_role_barber_check', type: 'check', fields: ['role', 'barberId'],
      where: { [Sequelize.Op.or]: [
        { role: 'owner', barberId: null },
        { role: 'barber', barberId: { [Sequelize.Op.ne]: null } },
      ] },
    });
  },
  async down(queryInterface) {
    await queryInterface.removeConstraint('admin_users', 'admin_users_role_barber_check');
    await queryInterface.removeConstraint('admin_users', 'admin_users_barber_fk');
    await queryInterface.removeColumn('admin_users', 'barberId');
    await queryInterface.removeColumn('admin_users', 'role');
  },
};
