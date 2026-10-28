'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { AdminUser, Barber, sequelize } = require('../models');
const requireAdmin = require('../middleware/requireAdmin');
const { publicUser } = require('../middleware/requireUser');

const router = express.Router();
router.use(requireAdmin);

router.get('/', async (_req, res) => {
  try {
    const users = await AdminUser.findAll({ attributes: ['id', 'email', 'role', 'barberId', 'active'], order: [['email', 'ASC']] });
    return res.json(users);
  } catch {
    return res.status(500).json({ error: 'No se pudieron consultar los usuarios' });
  }
});

router.post('/', async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !['email', 'password', 'role', 'barberId'].includes(key))
    || typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
    || typeof body.password !== 'string' || Array.from(body.password).length < 12 || Buffer.byteLength(body.password, 'utf8') > 72
    || !['owner', 'barber'].includes(body.role)
    || (body.role === 'barber' && (!Number.isInteger(body.barberId) || body.barberId <= 0))
    || (body.role === 'owner' && body.barberId != null)) {
    return res.status(400).json({ error: 'Ingresá email, contraseña válida, rol y vínculo de barbero válido' });
  }
  try {
    const passwordHash = await bcrypt.hash(body.password, 12);
    const result = await sequelize.transaction(async (transaction) => {
      if (body.role === 'barber') {
        const barber = await Barber.findOne({ where: { id: body.barberId, active: true }, transaction, lock: transaction.LOCK.UPDATE });
        if (!barber) return { status: 400, body: { error: 'El barbero debe existir y estar activo' } };
      }
      const user = await AdminUser.create({
        email: body.email.trim().toLowerCase(), passwordHash, role: body.role,
        barberId: body.role === 'barber' ? body.barberId : null, active: true,
      }, { transaction });
      return { status: 201, body: { user: publicUser(user) } };
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ error: 'El email o el barbero ya tiene un usuario asociado' });
    return res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
});

module.exports = router;
