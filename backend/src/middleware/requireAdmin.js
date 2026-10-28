'use strict';

const { AdminUser, Barber } = require('../models');
const { createRequireUser } = require('./requireUser');

function createRequireAdmin(adminUserModel = AdminUser, barberModel = Barber) {
  const authenticate = createRequireUser(adminUserModel, barberModel);
  return function requireAdmin(req, res, next) {
    return authenticate(req, res, () => {
      if (req.adminUser.role !== 'owner') return res.status(403).json({ error: 'Acceso exclusivo del dueño' });
      return next();
    });
  };
}

const requireAdmin = createRequireAdmin();
requireAdmin.createRequireAdmin = createRequireAdmin;

module.exports = requireAdmin;
