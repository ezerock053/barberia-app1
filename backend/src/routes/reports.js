'use strict';
const express = require('express');
const { Op, Transaction } = require('sequelize');
const { Appointment, Charge, Barber, Customer, sequelize } = require('../models');
const requireAdmin = require('../middleware/requireAdmin');
const { businessDate, validDate, businessDayRange } = require('../utils/businessDay');
const { buildDailyReport } = require('../utils/dailyReport');

function createReportsRouter({ AppointmentModel = Appointment, ChargeModel = Charge, BarberModel = Barber,
  CustomerModel = Customer, sequelizeInstance = sequelize, authorize = requireAdmin, now = () => new Date() } = {}) {
  const router = express.Router();
  router.get('/daily', authorize, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const today = businessDate(now());
    const date = req.query.date === undefined ? today : req.query.date;
    if (!validDate(date) || date > today || Object.keys(req.query).some((key) => key !== 'date')) {
      return res.status(400).json({ error: 'Elegí una fecha válida, hasta hoy, en formato YYYY-MM-DD.' });
    }
    const { start, end } = businessDayRange(date);
    try {
      const report = await sequelizeInstance.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ, readOnly: true }, async (transaction) => {
        const staff = { model: BarberModel, as: 'barber', attributes: ['id', 'name', 'active'] };
        const customer = { model: CustomerModel, as: 'customer', attributes: ['name'] };
        const charges = await ChargeModel.findAll({
          attributes: ['id', 'appointmentId', 'amount', 'currency', 'method', 'paidAt', 'dateSource'],
          where: { paidAt: { [Op.gte]: start, [Op.lt]: end } },
          include: [{ model: AppointmentModel, as: 'appointment', required: true,
            attributes: ['id', 'barberId', 'serviceName', 'status', 'completedAt'], include: [staff, customer] }],
          order: [['paidAt', 'DESC'], ['id', 'DESC']], transaction,
        });
        const completed = await AppointmentModel.findAll({
          attributes: ['id', 'barberId', 'serviceName', 'servicePrice', 'status', 'completedAt', 'paymentStatus'],
          where: { status: 'completed', completedAt: { [Op.gte]: start, [Op.lt]: end } },
          include: [staff, customer, { model: ChargeModel, as: 'charge', attributes: ['id'], required: false }],
          order: [['completedAt', 'DESC'], ['id', 'DESC']], transaction,
        });
        const barbers = await BarberModel.findAll({ attributes: ['id', 'name', 'active'], order: [['name', 'ASC']], transaction });
        const completedWithoutDate = await AppointmentModel.count({ where: { status: 'completed', completedAt: null }, transaction });
        const paidWithoutCharge = await AppointmentModel.count({ where: { paymentStatus: 'paid', '$charge.id$': null },
          include: [{ model: ChargeModel, as: 'charge', attributes: [], required: false }], transaction });
        return buildDailyReport({ date, charges, completed, barbers, historical: { completedWithoutDate, paidWithoutCharge }, generatedAt: now() });
      });
      return res.json(report);
    } catch {
      return res.status(500).json({ error: 'No se pudo calcular el reporte. Intentá nuevamente.' });
    }
  });
  return router;
}
module.exports = { createReportsRouter };
