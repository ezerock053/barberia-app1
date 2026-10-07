'use strict';

const session = require('express-session');
const SequelizeStoreFactory = require('connect-session-sequelize');
const { sequelize } = require('../models');

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function createSessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET debe estar configurado con al menos 32 caracteres');
  }
  const SequelizeStore = SequelizeStoreFactory(session.Store);
  const store = new SequelizeStore({ db: sequelize, tableName: 'Sessions' });

  const middleware = session({
    name: 'connect.sid',
    secret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DURATION_MS,
      path: '/',
    },
  });

  // Expose the configured store to the auth router for global session invalidation.
  middleware.sessionStore = store;
  return middleware;
}

module.exports = { createSessionMiddleware, SESSION_DURATION_MS };
