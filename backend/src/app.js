'use strict';

const express = require('express');
const servicesRouter = require('./routes/services');

const app = express();
app.use(express.json());
app.use('/api/services', servicesRouter);
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

module.exports = app;