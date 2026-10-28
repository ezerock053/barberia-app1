'use strict';
const express = require('express');
const { Appointment, Charge, sequelize } = require('../models');
const requireUser = require('../middleware/requireUser');
const { getCheckoutOrder, MercadoPagoError } = require('../utils/mercadoPago');
const { cents, decimal, transitionError, completionFields, orderMatches, recordProviderCharge, publicAppointment } = require('../utils/settlement');

function createAppointmentActionsRouter({ AppointmentModel = Appointment, ChargeModel = Charge, sequelizeInstance = sequelize,
  authenticate = requireUser, getOrder = getCheckoutOrder, getAccessToken = () => process.env.MERCADOPAGO_ACCESS_TOKEN } = {}) {
  const router = express.Router();
  async function operate(req, res, operation) {
    const id = /^\d+$/.test(req.params.id) ? Number(req.params.id) : 0;
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(404).json({ error: 'Turno no encontrado' });
    try {
      const result = await sequelizeInstance.transaction(async (transaction) => {
        const appointment = await AppointmentModel.unscoped().findOne({ where: { id,
          ...(req.adminUser.role === 'barber' ? { barberId: req.adminUser.barberId } : {}),
        }, transaction, lock: transaction.LOCK.UPDATE });
        if (!appointment) return { status: 404, body: { error: 'Turno no encontrado' } };
        return operation(appointment, transaction);
      });
      return res.status(result.status).json(result.body);
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ error: 'Este turno ya tiene un cobro registrado.' });
      if (error instanceof MercadoPagoError) return res.status(502).json({ error: 'No se pudo verificar Mercado Pago. No se registró ningún cobro presencial.' });
      return res.status(500).json({ error: 'No se pudo completar la operación.' });
    }
  }
  router.post('/:id/complete', authenticate, (req, res) => {
    if (req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) {
      return res.status(400).json({ error: 'La finalización no admite campos adicionales.' });
    }
    return operate(req, res, async (appointment, transaction) => {
      const error = transitionError(appointment, 'completed');
      if (error) return { status: 409, body: { error } };
      if (appointment.status !== 'completed') await appointment.update(completionFields(appointment, req.adminUser.id), { transaction });
      return { status: 200, body: publicAppointment(appointment) };
    });
  });
  function collect(req, res, complete = false) {
    const body = req.body;
    const fields = complete ? ['method', 'amount'] : ['amount', 'method', 'paidAt'];
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !fields.includes(key))
      || (body.method !== undefined && !['cash', 'transfer'].includes(body.method))
      || (complete && body.amount !== undefined && (cents(body.amount) === null || cents(body.amount) <= 0))
      || (!complete && (!['cash', 'transfer'].includes(body.method) || cents(body.amount) === null || cents(body.amount) <= 0))) {
      return res.status(400).json({ error: 'Ingresá un importe válido y elegí efectivo o transferencia.' });
    }
    const paidAt = body.paidAt === undefined ? new Date() : new Date(body.paidAt);
    const calendarDate = typeof body.paidAt === 'string' ? new Date(`${body.paidAt.slice(0, 10)}T00:00:00Z`) : null;
    if ((body.paidAt !== undefined && (typeof body.paidAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.paidAt)))
      || (calendarDate && (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== body.paidAt.slice(0, 10)))
      || !Number.isFinite(paidAt.getTime()) || paidAt.getTime() > Date.now()) {
      return res.status(400).json({ error: 'La fecha de cobro debe ser válida, con zona horaria, y no futura.' });
    }
    return operate(req, res, async (appointment, transaction) => {
      if (['cancelled', 'no_show'].includes(appointment.status)) return { status: 409, body: { error: 'No se puede cobrar un turno cancelado o ausente.' } };
      if (complete) {
        const error = transitionError(appointment, 'completed');
        if (error) return { status: 409, body: { error } };
      }
      const existing = await ChargeModel.findOne({ where: { appointmentId: appointment.id }, transaction });
      if (appointment.paymentStatus === 'paid' || existing) {
        if (complete) {
          const updates = completionFields(appointment, req.adminUser.id);
          if (existing && appointment.paymentStatus !== 'paid') Object.assign(updates, { paymentStatus: 'paid', paymentMethod: existing.method });
          if (Object.keys(updates).length) await appointment.update(updates, { transaction });
          return { status: 200, body: { ...publicAppointment(appointment), ...(existing ? { charge: existing } : {}) } };
        }
        return { status: 409, body: { error: 'Este turno ya está cobrado.' } };
      }
      const amount = complete && body.amount === undefined ? cents(appointment.servicePrice) : cents(body.amount);
      if (!['cash', 'transfer'].includes(body.method) || amount === null || amount <= 0) return { status: 400, body: { error: 'Elegí efectivo o transferencia y verificá el precio del turno.' } };
      if (amount !== cents(appointment.servicePrice)) return { status: 400, body: { error: 'El cobro completo debe coincidir con el precio histórico del turno.' } };
      if (appointment.mercadoPagoOrderId) {
        const token = getAccessToken();
        if (!token) return { status: 503, body: { error: 'No se puede verificar el checkout de Mercado Pago.' } };
        const order = await getOrder({ accessToken: token, orderId: appointment.mercadoPagoOrderId });
        if (!orderMatches(appointment, order)) return { status: 409, body: { error: 'La Order no corresponde al turno. Revisá Mercado Pago.' } };
        if (order.status === 'processed' && ['accredited', 'partially_refunded'].includes(order.status_detail)) {
          const charge = await recordProviderCharge(appointment, order, ChargeModel, transaction);
          await appointment.update({ paymentStatus: 'paid', ...(complete ? completionFields(appointment, req.adminUser.id) : {}) }, { transaction });
          if (complete) return { status: 200, body: { ...publicAppointment(appointment), charge } };
          return { status: 409, body: { error: 'Mercado Pago ya confirmó el pago. No se registró un cobro presencial.' } };
        }
        if (!['canceled', 'expired'].includes(order.status) || cents(order.total_paid_amount) !== 0) {
          return { status: 409, body: { error: 'El checkout de Mercado Pago sigue abierto o sin resolver. Cancelalo o esperá su vencimiento antes de cobrar presencialmente.' } };
        }
      } else if (appointment.mercadoPagoIdempotencyKey) {
        return { status: 409, body: { error: 'Hay un intento de checkout pendiente de reconciliar. No se puede cobrar presencialmente.' } };
      }
      const charge = await ChargeModel.create({ appointmentId: appointment.id, amount: decimal(amount),
        expectedAmount: decimal(cents(appointment.servicePrice)), currency: 'ARS', method: body.method, paidAt,
        dateSource: 'operator', recordedByUserId: req.adminUser.id, providerOrderId: null,
      }, { transaction });
      await appointment.update({ paymentMethod: body.method, paymentStatus: 'paid', paymentInitiationTokenHash: null, mercadoPagoCheckoutUrl: null,
        ...(complete ? completionFields(appointment, req.adminUser.id) : {}),
      }, { transaction });
      return { status: 201, body: { ...publicAppointment(appointment), charge } };
    });
  }
  router.post('/:id/charges', authenticate, (req, res) => collect(req, res));
  router.post('/:id/complete-and-charge', authenticate, (req, res) => collect(req, res, true));

  router.post('/:id/refresh-payment', authenticate, (req, res) => {
    if (req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) {
      return res.status(400).json({ error: 'La consulta no admite campos adicionales.' });
    }
    return operate(req, res, async (appointment, transaction) => {
      const existing = await ChargeModel.findOne({ where: { appointmentId: appointment.id }, transaction });
      if (existing || appointment.paymentStatus === 'paid' || !appointment.mercadoPagoOrderId) {
        return { status: 200, body: { ...publicAppointment(appointment), ...(existing ? { charge: existing } : {}) } };
      }
      const token = getAccessToken();
      if (!token) return { status: 503, body: { error: 'No se puede verificar Mercado Pago.' } };
      const order = await getOrder({ accessToken: token, orderId: appointment.mercadoPagoOrderId });
      if (!orderMatches(appointment, order)) return { status: 409, body: { error: 'La Order no corresponde al turno.' } };
      if (order.status === 'processed' && ['accredited', 'partially_refunded'].includes(order.status_detail)) {
        const charge = await recordProviderCharge(appointment, order, ChargeModel, transaction);
        await appointment.update({ paymentStatus: 'paid' }, { transaction });
        return { status: 200, body: { ...publicAppointment(appointment), charge } };
      }
      // Only a verified terminal Order with no payments enables cash collection.
      const paymentStatus = ['canceled', 'expired'].includes(order.status) && cents(order.total_paid_amount) === 0
        ? 'cancelled' : order.status === 'failed' ? 'rejected' : 'pending';
      if (appointment.paymentStatus !== paymentStatus) await appointment.update({ paymentStatus }, { transaction });
      return { status: 200, body: publicAppointment(appointment) };
    });
  });
  return router;
}
module.exports = { createAppointmentActionsRouter };
