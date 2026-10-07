'use strict';

const { AdminUser } = require('../models');

function createRequireAdmin(adminUserModel = AdminUser) {
  return async function requireAdmin(req, res, next) {
    const adminUserId = req.session?.adminUserId;
    if (!adminUserId) return res.status(401).json({ error: 'No autenticado' });

    try {
      const admin = await adminUserModel.findOne({
        attributes: ['id', 'email', 'active'],
        where: { id: adminUserId, active: true },
      });
      if (!admin) return res.status(401).json({ error: 'No autenticado' });
      req.adminUser = admin;
      return next();
    } catch {
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

const requireAdmin = createRequireAdmin();
requireAdmin.createRequireAdmin = createRequireAdmin;

module.exports = requireAdmin;
