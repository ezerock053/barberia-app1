'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { Appointment, sequelize } = require('../models');
const { getCheckoutOrder, MercadoPagoError } = require('../utils/mercadoPago');

function parseSignature(signature) {
  if (typeof signature !== 'string') return null;
  const fields = {};
  for (const part of signature.split(',')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if ((name === 'ts' || name === 'v1') && Object.hasOwn(fields, name)) return null;
    if (name === 'ts' || name === 'v1') fields[name] = value;
  }
  if (!/^\d{1,20}$/.test(fields.ts || '') || !/^[a-f\d]{64}$/i.test(fields.v1 || '')) return null;
  return fields;
}

function isValidWebhookSignature({ signature, requestId, dataId, secret }) {
  if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > 200) return false;
  if (typeof dataId !== 'string' || !/^[a-z\d_-]{1,64}$/i.test(dataId)) return false;
  if (typeof secret !== 'string' || secret.length === 0) return false;

  const fields = parseSignature(signature);
  if (!fields) return false;

  const provided = Buffer.from(fields.v1, 'hex');
  function matches(id) {
    const manifest = `id:${id};request-id:${requestId};ts:${fields.ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  }

  const normalizedId = dataId.toLowerCase();
  if (matches(normalizedId)) return true;
  // Some notifications sign the original ID rather than its lowercase form.
  return dataId !== normalizedId && matches(dataId);
}

function mapOrderStatusToPaymentStatus(order) {
  if (order?.status === 'processed'
    && ['accredited', 'partially_refunded'].includes(order.status_detail)) return 'paid';
  if (order?.status === 'failed') return 'rejected';
  if (['canceled', 'expired'].includes(order?.status)) return 'cancelled';
  if (['created', 'processing', 'action_required'].includes(order?.status)) return 'pending';
  return null;
}

function createMercadoPagoWebhookRouter({
  AppointmentModel = Appointment,
  sequelizeInstance = sequelize,
  getOrder = getCheckoutOrder,
  getAccessToken = () => process.env.MERCADOPAGO_ACCESS_TOKEN,
  getWebhookSecret = () => process.env.MERCADOPAGO_WEBHOOK_SECRET,
} = {}) {
  const router = express.Router();

  router.post('/mercadopago', async (req, res) => {
    const eventType = req.query.type ?? req.body?.type;
    if (eventType !== 'order') return res.sendStatus(200);

    const secret = getWebhookSecret();
    if (!secret) return res.status(503).json({ error: 'Webhook is not configured' });

    const notificationOrderId = req.query['data.id'];
    const requestId = req.get('x-request-id');
    const signature = req.get('x-signature');
    if (!isValidWebhookSignature({
      signature,
      requestId,
      dataId: notificationOrderId,
      secret,
    })) return res.sendStatus(401);

    const accessToken = getAccessToken();
    if (!accessToken) return res.status(503).json({ error: 'Payment service is not configured' });

    try {
      await sequelizeInstance.transaction(async (transaction) => {
        const appointment = await AppointmentModel.unscoped().findOne({
          where: { mercadoPagoOrderId: notificationOrderId, paymentMethod: 'mercado_pago' },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!appointment) return false;

        // Fetch after acquiring the row lock: concurrent deliveries must not
        // apply an API snapshot obtained before another delivery's update.
        const order = await getOrder({ accessToken, orderId: notificationOrderId });
        if (typeof order?.id !== 'string'
          || order.id.toLowerCase() !== notificationOrderId.toLowerCase()
          || order.external_reference !== `barberia-appointment-${appointment.id}`) return false;

        const paymentStatus = mapOrderStatusToPaymentStatus(order);
        if (!paymentStatus || appointment.paymentStatus === paymentStatus) return false;

        await appointment.update({ paymentStatus }, { transaction });
        return true;
      });

      return res.sendStatus(200);
    } catch (error) {
      if (error instanceof MercadoPagoError && error.status === 404) return res.sendStatus(200);
      const status = error instanceof MercadoPagoError ? error.status : undefined;
      console.error('Mercado Pago webhook processing failed', { status });
      return res.status(502).json({ error: 'Could not process Mercado Pago notification' });
    }
  });

  return router;
}

module.exports = {
  createMercadoPagoWebhookRouter,
  isValidWebhookSignature,
  mapOrderStatusToPaymentStatus,
};
