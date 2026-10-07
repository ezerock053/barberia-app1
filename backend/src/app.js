'use strict';

const express = require('express');
const servicesRouter = require('./routes/services');
const barbersRouter = require('./routes/barbers');
const schedulesRouter = require('./routes/schedules');
const customersRouter = require('./routes/customers');
const appointmentsRouter = require('./routes/appointments');
const availabilityRouter = require('./routes/availability');
const createAuthRouter = require('./routes/auth');
const { createSessionMiddleware } = require('./middleware/session');
const { sequelize } = require('./models');

const app = express();
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
const sessionMiddleware = createSessionMiddleware();
app.use(sessionMiddleware);
app.use(express.json());
app.use('/api/auth', createAuthRouter({
  invalidateSessions: (transaction) => sessionMiddleware.sessionStore.sessionModel.destroy({
    where: {},
    transaction,
  }),
  sequelizeInstance: sequelize,
}));
app.use('/api/services', servicesRouter);
app.use('/api/customers', customersRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/barbers/:barberId/schedules', schedulesRouter);
app.use('/api/barbers', barbersRouter);
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

module.exports = app;
