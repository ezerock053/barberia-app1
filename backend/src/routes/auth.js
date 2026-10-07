'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { AdminUser } = require('../models');

const INVALID_CREDENTIALS = { error: 'Email o contraseña incorrectos' };

function createAuthRouter({ adminUserModel = AdminUser, passwordHasher = bcrypt } = {}) {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(401).json(INVALID_CREDENTIALS);
    }

    try {
      const admin = await adminUserModel.unscoped().findOne({
        where: { email: email.trim().toLowerCase(), active: true },
      });
      if (!admin || !await passwordHasher.compare(password, admin.passwordHash)) {
        return res.status(401).json(INVALID_CREDENTIALS);
      }

      return req.session.regenerate((error) => {
        if (error) return res.status(500).json({ error: 'No se pudo iniciar la sesión' });
        req.session.adminUserId = admin.id;
        req.session.save((saveError) => {
          if (saveError) return res.status(500).json({ error: 'No se pudo iniciar la sesión' });
          return res.status(200).json({ admin: { id: admin.id, email: admin.email } });
        });
      });
    } catch {
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/logout', (req, res) => {
    req.session.destroy((error) => {
      if (error) return res.status(500).json({ error: 'No se pudo cerrar la sesión' });
      res.clearCookie('connect.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
      return res.status(204).end();
    });
  });

  router.get('/me', async (req, res) => {
    if (!req.session.adminUserId) return res.status(401).json({ error: 'No autenticado' });
    try {
      const admin = await adminUserModel.findOne({
        attributes: ['id', 'email'],
        where: { id: req.session.adminUserId, active: true },
      });
      if (!admin) {
        return req.session.destroy(() => res.status(401).json({ error: 'No autenticado' }));
      }
      return res.status(200).json({ admin: { id: admin.id, email: admin.email } });
    } catch {
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = createAuthRouter;
