'use strict';

const { AdminUser, Barber } = require('../models');

async function hasValidAccess(user, barberModel = Barber) {
  if (!user || !user.active) return false;
  if (user.role === 'owner') return user.barberId == null;
  if (user.role !== 'barber' || !Number.isInteger(user.barberId) || user.barberId <= 0) return false;
  return Boolean(await barberModel.findOne({ where: { id: user.barberId, active: true }, attributes: ['id'] }));
}

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, barberId: user.barberId ?? null };
}

function createRequireUser(userModel = AdminUser, barberModel = Barber) {
  return async function requireUser(req, res, next) {
    const id = req.session?.adminUserId;
    if (!id) return res.status(401).json({ error: 'No autenticado' });
    try {
      const user = await userModel.findOne({
        attributes: ['id', 'email', 'active', 'role', 'barberId'], where: { id, active: true },
      });
      if (!await hasValidAccess(user, barberModel)) return res.status(401).json({ error: 'No autenticado' });
      req.adminUser = user;
      return next();
    } catch {
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = createRequireUser();
module.exports.createRequireUser = createRequireUser;
module.exports.hasValidAccess = hasValidAccess;
module.exports.publicUser = publicUser;
