'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AdminUser extends Model {}

  AdminUser.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(60), allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    role: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'owner', validate: { isIn: [['owner', 'barber']] } },
    barberId: {
      type: DataTypes.INTEGER, allowNull: true, unique: true,
      references: { model: 'barbers', key: 'id' }, onUpdate: 'RESTRICT', onDelete: 'RESTRICT',
    },
  }, {
    sequelize,
    modelName: 'AdminUser',
    tableName: 'admin_users',
    timestamps: true,
    validate: {
      validRoleLink() {
        if ((this.role === 'barber' && (!Number.isInteger(this.barberId) || this.barberId <= 0))
          || (this.role === 'owner' && this.barberId != null)) {
          throw new Error('El barbero requiere un vínculo válido y el dueño no debe tenerlo.');
        }
      },
    },
    defaultScope: { attributes: { exclude: ['passwordHash'] } },
    scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
  });

  return AdminUser;
};
