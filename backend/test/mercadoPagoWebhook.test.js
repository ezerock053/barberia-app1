'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { createMercadoPagoWebhookRouter } = require('../src/routes/mercadoPagoWebhook');
const { getCheckoutOrder, MercadoPagoError } = require('../src/utils/mercadoPago');

const webhookSecret = 'test-webhook-secret-not-a-real-credential';
const accessToken = 'test-access-token-not-a-real-credential';
const orderId = 'ORD01TESTORDER17';
const requestId = 'test-request-17';

test('consulta la Order autenticándose con el Access Token del backend', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `https://api.mercadopago.com/v1/orders/${orderId}`);
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, `Bearer ${accessToken}`);
    return {
      ok: true,
      status: 200,
      async json() { return { id: orderId, status: 'created', status_detail: 'created' }; },
    };
  });

  const order = await getCheckoutOrder({ accessToken, orderId });
  assert.equal(order.id, orderId);
  assert.equal(fetch.mock.callCount(), 1);
});

test('la consulta aplica timeout de 15 segundos y propaga su error sin datos sensibles', async (t) => {
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 15000);
    return AbortSignal.abort();
  });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.signal.aborted, true);
    options.signal.throwIfAborted();
  });
  await assert.rejects(getCheckoutOrder({ accessToken, orderId }), (error) =>
    error instanceof MercadoPagoError && error.status === 0);
});

function signedHeaders(dataId = orderId, valid = true, normalize = true) {
  const ts = '1742505638683';
  const manifest = `id:${normalize ? dataId.toLowerCase() : dataId};request-id:${requestId};ts:${ts};`;
  const signature = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');
  return {
    'x-request-id': requestId,
    'x-signature': `ts=${ts},v1=${valid ? signature : '0'.repeat(64)}`,
  };
}

function createWebhookServer(t, { order, appointmentExists = true, getOrder } = {}) {
  const appointment = appointmentExists ? {
    id: 17,
    status: 'pending',
    paymentStatus: 'pending',
    mercadoPagoOrderId: orderId,
    servicePrice: '12000.00',
    updates: [],
    async update(values, options) {
      this.updates.push({ values, options });
      Object.assign(this, values);
      return this;
    },
  } : null;
  const lookups = [];
  const requests = [];
  const charges = [];
  const ChargeModel = {
    findOne: async () => charges[0] || null,
    create: async (values) => { charges.push({ id: 1, ...values }); return charges[0]; },
  };
  let lockTail = Promise.resolve();
  const AppointmentModel = {
    unscoped: () => ({
      findOne: async (options) => {
        lookups.push(options);
        const previous = lockTail;
        lockTail = new Promise((resolve) => { options.transaction.release = resolve; });
        await previous;
        return appointment;
      },
    }),
  };
  const sequelizeInstance = {
    transaction: async (callback) => {
      const transaction = { LOCK: { UPDATE: 'UPDATE' } };
      try { return await callback(transaction); }
      finally { transaction.release?.(); }
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/webhooks', createMercadoPagoWebhookRouter({
    AppointmentModel,
    ChargeModel,
    sequelizeInstance,
    getWebhookSecret: () => webhookSecret,
    getAccessToken: () => accessToken,
    getOrder: async (options) => {
      requests.push(options);
      const result = getOrder ? await getOrder(options) : order || {
        id: orderId,
        external_reference: 'barberia-appointment-17',
        status: 'created',
        status_detail: 'created',
      };
      return { total_paid_amount: '12000.00', currency: 'ARS', last_updated_date: '2026-10-28T14:00:00Z', ...result };
    },
  }));

  const server = app.listen(0);
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  return new Promise((resolve) => server.once('listening', () => resolve({
    base: `http://127.0.0.1:${server.address().port}`,
    appointment,
    lookups,
    requests,
    charges,
  })));
}

async function sendOrderNotification(base, { dataId = orderId, headers = signedHeaders(dataId), bodyType = 'order', bodyData = {} } = {}) {
  return fetch(`${base}/api/webhooks/mercadopago?data.id=${encodeURIComponent(dataId)}&type=order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'order.processed', type: bodyType, data: { id: dataId, ...bodyData } }),
  });
}

test('rechaza un webhook de Order con firma inválida antes de consultar Mercado Pago', async (t) => {
  const context = await createWebhookServer(t);
  const response = await sendOrderNotification(context.base, { headers: signedHeaders(orderId, false) });

  assert.equal(response.status, 401);
  assert.equal(context.requests.length, 0);
  assert.equal(context.lookups.length, 0);
  assert.equal(context.appointment.updates.length, 0);
});

test('una notificación firmada consulta la Order y mantiene pendiente el pago aún no procesado', async (t) => {
  const context = await createWebhookServer(t);
  const response = await sendOrderNotification(context.base);

  assert.equal(response.status, 200);
  assert.deepEqual(context.requests, [{ accessToken, orderId }]);
  assert.equal(context.lookups.length, 1);
  assert.deepEqual(context.lookups[0].where, { mercadoPagoOrderId: orderId });
  assert.equal(context.lookups[0].lock, 'UPDATE');
  assert.equal(context.appointment.updates.length, 0);
  assert.equal(context.appointment.status, 'pending');
});

test('acepta la firma del ID original y consulta la Order sin normalizar su ID', async (t) => {
  const context = await createWebhookServer(t);
  const response = await sendOrderNotification(context.base, { headers: signedHeaders(orderId, true, false) });

  assert.equal(response.status, 200);
  assert.deepEqual(context.requests, [{ accessToken, orderId }]);
  assert.equal(context.lookups.length, 1);
  assert.equal(context.appointment.updates.length, 0);
});

test('rechaza firmas alteradas, incompletas y datos distintos sin consultar ni actualizar', async (t) => {
  const context = await createWebhookServer(t);
  const original = signedHeaders(orderId, true, false);
  const normalized = signedHeaders(orderId);
  const cases = [
    { headers: { ...original, 'x-request-id': 'another-request' } },
    { headers: { ...normalized, 'x-request-id': 'another-request' } },
    { dataId: `${orderId}X`, headers: original },
    { headers: { ...original, 'x-signature': original['x-signature'].replace('ts=1742505638683', 'ts=1742505638684') } },
    { headers: { ...original, 'x-signature': 'ts=1742505638683,v1=invalid' } },
    { headers: {} },
    { headers: signedHeaders(orderId, false, false) },
  ];
  for (const notification of cases) {
    const response = await sendOrderNotification(context.base, notification);
    assert.equal(response.status, 401);
  }
  assert.equal(context.requests.length, 0);
  assert.equal(context.lookups.length, 0);
  assert.equal(context.appointment.updates.length, 0);
});

test('una Order procesada y acreditada actualiza solamente paymentStatus a paid', async (t) => {
  const context = await createWebhookServer(t, {
    order: {
      id: orderId,
      external_reference: 'barberia-appointment-17',
      status: 'processed',
      status_detail: 'accredited',
    },
  });
  const response = await sendOrderNotification(context.base);

  assert.equal(response.status, 200);
  assert.deepEqual(context.appointment.updates[0].values, { paymentStatus: 'paid' });
  assert.equal(context.appointment.status, 'pending');
});

test('una Order fallida actualiza paymentStatus a rejected', async (t) => {
  const context = await createWebhookServer(t, {
    order: { id: orderId, external_reference: 'barberia-appointment-17', status: 'failed', status_detail: 'rejected_by_issuer' },
  });
  const response = await sendOrderNotification(context.base);

  assert.equal(response.status, 200);
  assert.deepEqual(context.appointment.updates[0].values, { paymentStatus: 'rejected' });
});

test('una Order cancelada actualiza paymentStatus a cancelled', async (t) => {
  const context = await createWebhookServer(t, {
    order: { id: orderId, external_reference: 'barberia-appointment-17', status: 'canceled', status_detail: 'canceled' },
  });
  const response = await sendOrderNotification(context.base);

  assert.equal(response.status, 200);
  assert.deepEqual(context.appointment.updates[0].values, { paymentStatus: 'cancelled' });
});

test('una Order válida pero desconocida para el backend no modifica reservas', async (t) => {
  const context = await createWebhookServer(t, {
    appointmentExists: false,
    order: { id: orderId, external_reference: 'barberia-appointment-17', status: 'processed', status_detail: 'accredited' },
  });
  const response = await sendOrderNotification(context.base);

  assert.equal(response.status, 200);
  assert.equal(context.requests.length, 0);
  assert.equal(context.lookups.length, 1);
});

test('duplicados acreditados actualizan una sola vez y no crean reservas', async (t) => {
  const context = await createWebhookServer(t, {
    order: { id: orderId, external_reference: 'barberia-appointment-17', status: 'processed', status_detail: 'accredited' },
  });
  for (let i = 0; i < 2; i++) assert.equal((await sendOrderNotification(context.base)).status, 200);
  assert.equal(context.requests.length, 2);
  assert.equal(context.appointment.updates.length, 1);
  assert.equal(context.appointment.paymentStatus, 'paid');
  assert.equal(context.appointment.status, 'pending');
  assert.equal(context.charges.length, 1);
  assert.equal(context.charges[0].amount, '12000.00');
  assert.equal(context.charges[0].recordedByUserId, null);
  assert.equal(context.charges[0].dateSource, 'provider_update');
});

test('webhook no acredita importes insuficientes, moneda distinta o sin importe de API', async (t) => {
  for (const values of [{ total_paid_amount: '1.00' }, { currency: 'USD' }, { total_paid_amount: null }]) {
    const context = await createWebhookServer(t, { order: { id: orderId, external_reference: 'barberia-appointment-17',
      status: 'processed', status_detail: 'accredited', ...values } });
    assert.equal((await sendOrderNotification(context.base)).status, 502);
    assert.equal(context.charges.length, 0);
    assert.equal(context.appointment.paymentStatus, 'pending');
  }
});

test('webhook valida referencia externa antes de registrar un cobro', async (t) => {
  const context = await createWebhookServer(t, { order: { id: orderId, external_reference: 'barberia-appointment-99', status: 'processed', status_detail: 'accredited' } });
  assert.equal((await sendOrderNotification(context.base)).status, 200);
  assert.equal(context.charges.length, 0);
  assert.equal(context.appointment.updates.length, 0);
});

test('notificación pendiente tardía no revierte un cobro acreditado', async (t) => {
  let calls = 0;
  const context = await createWebhookServer(t, { getOrder: async () => ({ id: orderId, external_reference: 'barberia-appointment-17',
    status: ++calls === 1 ? 'processed' : 'created', status_detail: calls === 1 ? 'accredited' : 'created' }) });
  assert.equal((await sendOrderNotification(context.base)).status, 200);
  assert.equal((await sendOrderNotification(context.base)).status, 200);
  assert.equal(context.charges.length, 1); assert.equal(context.appointment.updates.length, 1);
  assert.equal(context.appointment.paymentStatus, 'paid');
});

test('un cobro presencial existente no se sobrescribe por una aprobación contradictoria', async (t) => {
  const context = await createWebhookServer(t, { order: { id: orderId, external_reference: 'barberia-appointment-17', status: 'processed', status_detail: 'accredited' } });
  context.charges.push({ id: 1, appointmentId: 17, method: 'cash', amount: '12000.00' });
  context.appointment.paymentStatus = 'paid';
  assert.equal((await sendOrderNotification(context.base)).status, 502);
  assert.equal(context.charges.length, 1); assert.equal(context.charges[0].method, 'cash');
  assert.equal(context.appointment.updates.length, 0);
});

test('un error de API libera el bloqueo para la siguiente notificacion', async (t) => {
  let calls = 0;
  const context = await createWebhookServer(t, { getOrder: async () => {
    if (++calls === 1) throw new MercadoPagoError(0);
    return { id: orderId, external_reference: 'barberia-appointment-17', status: 'created' };
  } });
  assert.equal((await sendOrderNotification(context.base)).status, 502);
  assert.equal(context.appointment.updates.length, 0);
  assert.equal((await sendOrderNotification(context.base)).status, 200);
  assert.equal(calls, 2);
  assert.equal(context.appointment.paymentStatus, 'pending');
});

test('duplicados con Order inexistente ignoran el pago acreditado del body', async (t) => {
  const context = await createWebhookServer(t, { getOrder: async () => { throw new MercadoPagoError(404); } });
  for (let i = 0; i < 2; i++) {
    assert.equal((await sendOrderNotification(context.base, { bodyData: { status: 'processed', status_detail: 'accredited' } })).status, 200);
  }
  assert.equal(context.requests.length, 2);
  assert.equal(context.appointment.updates.length, 0);
  assert.equal(context.appointment.paymentStatus, 'pending');
});

test('estado acreditado del body no reemplaza el estado pendiente de la API', async (t) => {
  const context = await createWebhookServer(t);
  assert.equal((await sendOrderNotification(context.base, { bodyData: { status: 'processed', status_detail: 'accredited' } })).status, 200);
  assert.equal(context.requests.length, 1);
  assert.equal(context.appointment.paymentStatus, 'pending');
  assert.equal(context.appointment.updates.length, 0);
});

test('notificaciones concurrentes consultan la API en serie bajo el bloqueo', async (t) => {
  let releaseFirst;
  let firstStarted;
  const started = new Promise((resolve) => { firstStarted = resolve; });
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const context = await createWebhookServer(t, { getOrder: async () => {
    calls++;
    if (calls === 1) { firstStarted(); await gate; }
    return { id: orderId, external_reference: 'barberia-appointment-17', status: calls === 1 ? 'created' : 'processed', status_detail: calls === 1 ? 'created' : 'accredited' };
  } });
  t.after(() => releaseFirst());
  const first = sendOrderNotification(context.base);
  await started;
  const second = sendOrderNotification(context.base);
  // Wait until the second delivery reaches the row lock, without timing guesses.
  while (context.lookups.length < 2) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  releaseFirst();
  const responses = await Promise.all([first, second]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(calls, 2);
  assert.equal(context.appointment.paymentStatus, 'paid');
  assert.equal(context.appointment.status, 'pending');
  assert.equal(context.appointment.updates.length, 1);
});
