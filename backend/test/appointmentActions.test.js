'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { Appointment, AdminUser, Barber, sequelize } = require('../src/models');
const { MercadoPagoError } = require('../src/utils/mercadoPago');
const { createAppointmentActionsRouter } = require('../src/routes/appointmentActions');
const { createMercadoPagoWebhookRouter } = require('../src/routes/mercadoPagoWebhook');
const { protectedEditError } = require('../src/utils/settlement');

async function harness(t, overrides = {}, getOrder) {
  const charges = [];
  const updates = [];
  const row = { id: 17, barberId: 2, customerId: 1, serviceId: 1, serviceName: 'Corte histórico', servicePrice: '12000.00',
    status: 'pending', paymentStatus: 'pending', paymentMethod: 'cash', startAt: new Date(Date.now() + 86400000),
    completedAt: null, completedByUserId: null, mercadoPagoOrderId: null, mercadoPagoIdempotencyKey: null,
    ...overrides,
    async update(values) { Object.assign(this, values); updates.push(values); return this; },
    async reload() { return this; },
  };
  let tail = Promise.resolve();
  let lockCount = 0;
  let apiCalls = 0;
  const appointments = {
    async findOne({ where, transaction, lock }) {
      if ((where.id && where.id !== row.id) || (where.barberId && where.barberId !== row.barberId)
        || (where.mercadoPagoOrderId && where.mercadoPagoOrderId !== row.mercadoPagoOrderId)) return null;
      assert.equal(lock, 'UPDATE');
      const previous = tail;
      tail = new Promise((resolve) => { transaction.release = resolve; });
      lockCount++;
      await previous;
      transaction.snapshot = { ...row };
      transaction.chargeCount = charges.length;
      return row;
    },
    async findByPk(id, options) { return this.findOne({ where: { id }, ...options }); },
  };
  const AppointmentModel = { unscoped: () => appointments };
  const ChargeModel = {
    async findOne() { return charges[0] || null; },
    async create(values) {
      if (charges.length) { const error = new Error(); error.name = 'SequelizeUniqueConstraintError'; throw error; }
      const charge = { id: 1, ...values }; charges.push(charge); return charge;
    },
  };
  const transaction = async (callback) => {
    const tx = { LOCK: { UPDATE: 'UPDATE' } };
    try { return await callback(tx); }
    catch (error) {
      if (tx.snapshot) { Object.assign(row, tx.snapshot); charges.length = tx.chargeCount; }
      throw error;
    } finally { tx.release?.(); }
  };
  t.mock.method(sequelize, 'transaction', transaction);
  t.mock.method(Appointment, 'unscoped', () => appointments);
  t.mock.method(Appointment, 'findByPk', (id, options) => appointments.findByPk(id, options));
  t.mock.method(AdminUser, 'findOne', async ({ where }) => ({
    1: { id: 1, email: 'owner@example.com', role: 'owner', barberId: null, active: true },
    2: { id: 2, email: 'barber2@example.com', role: 'barber', barberId: 2, active: true },
    3: { id: 3, email: 'barber3@example.com', role: 'barber', barberId: 3, active: true },
  })[where.id] || null);
  t.mock.method(Barber, 'findOne', async ({ where }) => ({ id: where.id }));
  const provider = async (options) => {
    apiCalls++;
    if (getOrder) return getOrder(options);
    return { id: row.mercadoPagoOrderId, external_reference: 'barberia-appointment-17', currency: 'ARS',
      status: 'created', total_paid_amount: '0.00', last_updated_date: '2026-10-28T14:00:00Z' };
  };
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.session = { adminUserId: Number(req.get('x-test-user')) || undefined }; next(); });
  app.use('/api/appointments', createAppointmentActionsRouter({ AppointmentModel, ChargeModel,
    sequelizeInstance: { transaction }, getOrder: provider, getAccessToken: () => 'fake-test-access-token' }));
  app.use('/api/appointments', require('../src/routes/appointments'));
  app.use('/api/webhooks', createMercadoPagoWebhookRouter({ AppointmentModel, ChargeModel,
    sequelizeInstance: { transaction }, getOrder: provider, getAccessToken: () => 'fake-test-access-token', getWebhookSecret: () => 'fake-test-webhook-secret' }));
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, body = {}, user = 2, method = 'POST', extraHeaders = {}) => fetch(`${base}/api/appointments/${path}`, {
    method, headers: { 'content-type': 'application/json', 'x-test-user': String(user), ...extraHeaders }, body: JSON.stringify(body),
  });
  const webhook = () => {
    const ts = '1742505638683'; const rid = 'test-event';
    const signature = crypto.createHmac('sha256', 'fake-test-webhook-secret').update(`id:${row.mercadoPagoOrderId.toLowerCase()};request-id:${rid};ts:${ts};`).digest('hex');
    return fetch(`${base}/api/webhooks/mercadopago?type=order&data.id=${row.mercadoPagoOrderId}`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': rid, 'x-signature': `ts=${ts},v1=${signature}` },
      body: JSON.stringify({ type: 'order', data: { id: row.mercadoPagoOrderId, status: 'processed', status_detail: 'accredited' } }),
    });
  };
  return { row, charges, updates, request, webhook, ChargeModel, get lockCount() { return lockCount; }, get apiCalls() { return apiCalls; } };
}
const cash = { method: 'cash', amount: '12000.00' };
const paidOrder = { id: 'ORD17', external_reference: 'barberia-appointment-17', status: 'processed', status_detail: 'accredited',
  currency: 'ARS', total_paid_amount: '12000.00', last_updated_date: '2026-10-28T14:00:00Z' };

test('finalización guarda actor y fecha sin cobrar y es idempotente', async (t) => {
  const h = await harness(t);
  assert.equal((await h.request('17/complete')).status, 200);
  const date = h.row.completedAt;
  assert.equal(h.row.completedByUserId, 2);
  assert.ok(date instanceof Date);
  assert.equal(h.row.status, 'completed'); assert.equal(h.row.paymentStatus, 'pending');
  assert.equal((await h.request('17/complete', {}, 1)).status, 200);
  assert.equal(h.row.completedAt, date); assert.equal(h.row.completedByUserId, 2); assert.equal(h.updates.length, 1);
});

test('efectivo antes de realizar y transferencia después guardan total histórico y trazabilidad', async (t) => {
  const h = await harness(t);
  const response = await h.request('17/charges', { ...cash, paidAt: '2026-10-27T10:00:00-03:00' }, 1);
  assert.equal(response.status, 201);
  assert.equal(h.row.status, 'pending'); assert.equal(h.row.paymentStatus, 'paid');
  assert.equal(h.charges[0].amount, '12000.00'); assert.equal(h.charges[0].expectedAmount, '12000.00');
  assert.equal(h.charges[0].recordedByUserId, 1); assert.equal(h.charges[0].paidAt.toISOString(), '2026-10-27T13:00:00.000Z');
  assert.equal((await h.request('17/complete')).status, 200);
  assert.equal((await h.request('17/charges', cash)).status, 409);
});

test('barbero puede cobrar una transferencia de su servicio ya realizado', async (t) => {
  const h = await harness(t, { status: 'completed' });
  assert.equal((await h.request('17/charges', { ...cash, method: 'transfer' })).status, 201);
  assert.equal(h.row.status, 'completed'); assert.equal(h.row.paymentMethod, 'transfer');
  assert.equal(h.charges[0].recordedByUserId, 2);
});

test('sin sesión o con otro barbero no se finaliza ni se cobra; IDs manipulados no autorizan', async (t) => {
  const h = await harness(t);
  for (const [path, body] of [['17/complete', {}], ['17/charges', cash]]) {
    assert.equal((await h.request(path, body, 0)).status, 401);
    assert.equal((await h.request(path, body, 3)).status, 404);
  }
  assert.equal((await h.request('17/charges', { ...cash, barberId: 2 }, 3)).status, 400);
  assert.equal((await h.request('18/complete')).status, 404);
  assert.equal(h.charges.length, 0); assert.equal(h.updates.length, 0);
});

for (const status of ['cancelled', 'no_show']) {
  test(`turno ${status} no se finaliza, no se cobra y no se reactiva`, async (t) => {
    const h = await harness(t, { status });
    assert.equal((await h.request('17/complete')).status, 409);
    assert.equal((await h.request('17/charges', cash)).status, 409);
    assert.equal((await h.request('17', { status: 'pending' }, 1, 'PUT')).status, 409);
    assert.equal(h.charges.length, 0);
  });
}

test('importes parciales, adicionales, fechas ambiguas y datos de auditoría forjados se rechazan', async (t) => {
  const h = await harness(t);
  for (const changes of [{ amount: '1.00' }, { amount: '12000.01' }, { amount: '0' }, { amount: '-1' }, { amount: '12000.001' },
    { method: 'mercado_pago' }, { paidAt: '2026-10-28T10:00' }, { paidAt: 'bad' }, { paidAt: '2026-02-30T10:00:00Z' }, { paidAt: '2999-01-01T10:00:00Z' },
    { recordedByUserId: 99 }, { paymentStatus: 'paid' }]) {
    assert.equal((await h.request('17/charges', { ...cash, ...changes })).status, 400);
  }
  assert.equal((await h.request('17/complete', { completedByUserId: 99 })).status, 400);
  assert.equal(h.charges.length, 0);
});

test('dos cobros presenciales simultáneos producen exactamente un cobro', async (t) => {
  const h = await harness(t);
  const responses = await Promise.all([h.request('17/charges', cash, 1), h.request('17/charges', { ...cash, method: 'transfer' })]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal(h.charges.length, 1); assert.equal(h.row.paymentStatus, 'paid');
});

test('cobro y finalización concurrentes conservan ambas trazas', async (t) => {
  const h = await harness(t);
  const responses = await Promise.all([h.request('17/charges', cash), h.request('17/complete')]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  assert.equal(h.charges.length, 1); assert.equal(h.row.status, 'completed'); assert.equal(h.row.paymentStatus, 'paid');
});

test('pago histórico sin detalle también impide volver a cobrar', async (t) => {
  const h = await harness(t, { paymentStatus: 'paid', paymentMethod: 'mercado_pago' });
  assert.equal((await h.request('17/charges', cash)).status, 409);
  assert.equal(h.charges.length, 0);
});

test('checkout abierto y creación incierta bloquean el cobro presencial', async (t) => {
  const h = await harness(t, { mercadoPagoOrderId: 'ORD17', mercadoPagoIdempotencyKey: 'test-key', paymentMethod: 'mercado_pago' });
  assert.equal((await h.request('17/charges', cash)).status, 409);
  assert.equal(h.apiCalls, 1); assert.equal(h.charges.length, 0);
  h.row.mercadoPagoOrderId = null;
  assert.equal((await h.request('17/charges', cash)).status, 409);
  assert.equal(h.apiCalls, 1);
});

for (const status of ['canceled', 'expired']) {
  test(`Order ${status} verificada y sin pagos permite cobro; webhook tardío no lo revierte`, async (t) => {
    const h = await harness(t, { mercadoPagoOrderId: 'ORD17', mercadoPagoIdempotencyKey: 'test-key', paymentMethod: 'mercado_pago' }, async () => ({ ...paidOrder, status, total_paid_amount: '0.00' }));
    assert.equal((await h.request('17/charges', cash)).status, 201);
    assert.equal(h.row.paymentMethod, 'cash'); assert.equal(h.row.paymentInitiationTokenHash, null);
    assert.equal((await h.webhook()).status, 200);
    assert.equal(h.row.paymentStatus, 'paid'); assert.equal(h.charges.length, 1);
  });
}

test('fallo o 404 de API no desbloquea el checkout ni registra cobro', async (t) => {
  const h = await harness(t, { mercadoPagoOrderId: 'ORD17', paymentMethod: 'mercado_pago' }, async () => { throw new MercadoPagoError(404); });
  assert.equal((await h.request('17/charges', cash)).status, 502);
  assert.equal(h.charges.length, 0); assert.equal(h.row.paymentStatus, 'pending');
});

test('API acreditada impide cobro presencial y reconcilia un único cobro Mercado Pago', async (t) => {
  const h = await harness(t, { mercadoPagoOrderId: 'ORD17', paymentMethod: 'mercado_pago' }, async () => paidOrder);
  assert.equal((await h.request('17/charges', cash)).status, 409);
  assert.equal(h.charges.length, 1); assert.equal(h.charges[0].method, 'mercado_pago');
  assert.equal(h.row.paymentStatus, 'paid'); assert.equal(h.row.status, 'pending');
});

test('webhook y cobro presencial concurrentes nunca crean dos cobros', async (t) => {
  const h = await harness(t, { mercadoPagoOrderId: 'ORD17', paymentMethod: 'mercado_pago' }, async () => paidOrder);
  const responses = await Promise.all([h.request('17/charges', cash), h.webhook()]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal(h.charges.length, 1); assert.equal(h.charges[0].method, 'mercado_pago');
  assert.equal(h.row.status, 'pending');
  assert.equal((await h.webhook()).status, 200); assert.equal(h.charges.length, 1);
});

test('checkout no vuelve a abrirse tras cobrar, aunque exista una URL previa', async (t) => {
  const token = 'P'.repeat(43);
  const h = await harness(t, { paymentStatus: 'paid', paymentMethod: 'mercado_pago', mercadoPagoOrderId: 'ORD17', mercadoPagoCheckoutUrl: 'https://www.mercadopago.com.ar/checkout',
    paymentInitiationTokenHash: crypto.createHash('sha256').update(token).digest('hex') });
  const response = await h.request('17/payment', {}, 0, 'POST', { 'X-Payment-Token': token });
  assert.equal(response.status, 409);
});

test('reservas realizadas, pagadas o con checkout no admiten cambios incompatibles', async (t) => {
  const h = await harness(t, { status: 'completed', paymentStatus: 'paid' });
  for (const body of [{ status: 'pending' }, { status: 'cancelled' }, { status: 'no_show' }, { barberId: 3 }, { serviceId: 2 }, { startAt: '2026-10-29 12:00:00' }]) {
    assert.equal((await h.request('17', body, 1, 'PUT')).status, 409);
  }
  assert.equal((await h.request('17', { notes: 'Nota válida' }, 1, 'PUT')).status, 200);
  assert.equal((await h.request('17', {}, 1, 'DELETE')).status, 409);
  assert.ok(protectedEditError({ status: 'pending', mercadoPagoIdempotencyKey: 'test-key' }, { serviceId: 2 }));
});

test('PUT del dueño también registra la trazabilidad al finalizar', async (t) => {
  const h = await harness(t);
  assert.equal((await h.request('17', { status: 'completed' }, 1, 'PUT')).status, 200);
  assert.equal(h.row.completedByUserId, 1);
  assert.ok(h.row.completedAt instanceof Date);
  assert.equal(h.row.paymentStatus, 'pending');
});

test('errores al actualizar revierten el cobro y liberan el bloqueo para reintentar', async (t) => {
  const h = await harness(t);
  const update = h.row.update;
  h.row.update = async () => { throw new Error('Simulated database failure'); };
  assert.equal((await h.request('17/charges', cash)).status, 500);
  assert.equal(h.charges.length, 0); assert.equal(h.row.paymentStatus, 'pending');
  h.row.update = update;
  assert.equal((await h.request('17/charges', cash)).status, 201);
  assert.equal(h.charges.length, 1);
});

for (const method of ['cash', 'transfer']) {
  test(`finalizar y cobrar ${method} guarda ambas trazas atómicamente`, async (t) => {
    const h = await harness(t);
    const response = await h.request('17/complete-and-charge', { method }, method === 'cash' ? 1 : 2);
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.status, 'completed'); assert.equal(result.paymentStatus, 'paid');
    assert.equal(result.charge.amount, '12000.00'); assert.equal(result.charge.method, method);
    assert.equal(h.charges.length, 1); assert.ok(h.row.completedAt instanceof Date);
    assert.equal(h.row.completedByUserId, method === 'cash' ? 1 : 2);
    assert.equal(h.charges[0].recordedByUserId, h.row.completedByUserId);
    assert.equal(h.updates.length, 1);
  });
}

test('operación combinada impide permisos, importes y campos manipulados sin cambios parciales', async (t) => {
  const h = await harness(t);
  assert.equal((await h.request('17/complete-and-charge', { method: 'cash' }, 0)).status, 401);
  assert.equal((await h.request('17/complete-and-charge', { method: 'cash' }, 3)).status, 404);
  for (const body of [{}, { method: 'invalid' }, { method: 'mercado_pago' }, { method: 'cash', amount: '1' },
    { method: 'cash', amount: '0' }, { method: 'cash', amount: '12000.01' }, { method: 'cash', barberId: 2 },
    { method: 'cash', completedByUserId: 1 }, { method: 'cash', paidAt: '2026-10-28T10:00:00Z' }]) {
    assert.equal((await h.request('17/complete-and-charge', body)).status, 400);
  }
  assert.equal(h.row.status, 'pending'); assert.equal(h.row.paymentStatus, 'pending');
  assert.equal(h.charges.length, 0); assert.equal(h.updates.length, 0);
});

for (const status of ['cancelled', 'no_show']) {
  test(`operación combinada rechaza turno ${status} sin registrar nada`, async (t) => {
    const h = await harness(t, { status });
    assert.equal((await h.request('17/complete-and-charge', { method: 'cash' })).status, 409);
    assert.equal(h.row.status, status); assert.equal(h.charges.length, 0); assert.equal(h.updates.length, 0);
  });
}

test('si ya está pagado la combinada solo finaliza y el reintento no cambia autor ni fecha', async (t) => {
  const h = await harness(t, { paymentStatus: 'paid', paymentMethod: 'mercado_pago', mercadoPagoOrderId: 'ORD17' });
  assert.equal((await h.request('17/complete-and-charge', {})).status, 200);
  const completedAt = h.row.completedAt;
  assert.equal((await h.request('17/complete-and-charge', { method: 'transfer' }, 1)).status, 200);
  assert.equal(h.row.status, 'completed'); assert.equal(h.row.paymentMethod, 'mercado_pago');
  assert.equal(h.charges.length, 0); assert.equal(h.apiCalls, 0);
  assert.equal(h.row.completedAt, completedAt); assert.equal(h.row.completedByUserId, 2);
});

test('combinada en un realizado sin cobrar cobra sin reescribir la finalización anterior', async (t) => {
  const date = new Date('2026-10-27T14:00:00Z');
  const h = await harness(t, { status: 'completed', completedAt: date, completedByUserId: 1 });
  assert.equal((await h.request('17/complete-and-charge', { method: 'cash' })).status, 201);
  assert.equal(h.row.completedAt, date); assert.equal(h.row.completedByUserId, 1);
  assert.equal(h.charges[0].recordedByUserId, 2);
});

test('doble confirmación combinada produce un solo cobro y una finalización', async (t) => {
  const h = await harness(t);
  const responses = await Promise.all([h.request('17/complete-and-charge', { method: 'cash' }), h.request('17/complete-and-charge', { method: 'transfer' })]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  assert.equal(h.row.status, 'completed'); assert.equal(h.row.paymentStatus, 'paid');
  assert.equal(h.charges.length, 1); assert.equal(h.updates.length, 1);
});

test('combinada y cobro simple simultáneos no duplican cobros ni pierden la finalización', async (t) => {
  const h = await harness(t);
  const responses = await Promise.all([h.request('17/charges', cash), h.request('17/complete-and-charge', { method: 'transfer' })]);
  assert.ok(responses.every((response) => [200, 201, 409].includes(response.status)));
  assert.equal(h.row.status, 'completed'); assert.equal(h.row.paymentStatus, 'paid'); assert.equal(h.charges.length, 1);
});

test('si falla la finalización en la combinada el cobro también se revierte', async (t) => {
  const h = await harness(t);
  const update = h.row.update;
  h.row.update = async (values) => { assert.equal(values.status, 'completed'); throw new Error('Simulated finalization failure'); };
  assert.equal((await h.request('17/complete-and-charge', { method: 'cash' })).status, 500);
  assert.equal(h.charges.length, 0); assert.equal(h.row.paymentStatus, 'pending'); assert.equal(h.row.status, 'pending');
  assert.equal(h.row.completedAt, null);
  h.row.update = update;
  assert.equal((await h.request('17/complete-and-charge', { method: 'cash' })).status, 201);
  assert.equal(h.charges.length, 1);
});

test('checkout pendiente impide la combinada sin finalizar el servicio', async (t) => {
  const h = await harness(t, { mercadoPagoOrderId: 'ORD17', paymentMethod: 'mercado_pago' });
  assert.equal((await h.request('17/complete-and-charge', { method: 'cash' })).status, 409);
  assert.equal(h.charges.length, 0); assert.equal(h.row.status, 'pending'); assert.equal(h.row.completedAt, null);
});

test('error de Mercado Pago revierte toda la combinada', async (t) => {
  const h = await harness(t, { mercadoPagoOrderId: 'ORD17', paymentMethod: 'mercado_pago' }, async () => { throw new MercadoPagoError(0); });
  assert.equal((await h.request('17/complete-and-charge', { method: 'transfer' })).status, 502);
  assert.equal(h.charges.length, 0); assert.equal(h.row.status, 'pending'); assert.equal(h.row.paymentStatus, 'pending');
});

test('webhook y combinada simultáneos terminan con un cobro Mercado Pago y servicio realizado', async (t) => {
  const h = await harness(t, { mercadoPagoOrderId: 'ORD17', paymentMethod: 'mercado_pago' }, async () => paidOrder);
  const responses = await Promise.all([h.webhook(), h.request('17/complete-and-charge', { method: 'cash' })]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(h.charges.length, 1); assert.equal(h.charges[0].method, 'mercado_pago');
  assert.equal(h.row.status, 'completed'); assert.equal(h.row.paymentStatus, 'paid');
});

test('verificar checkout pendiente no habilita el cobro, pero permite seguir finalizando solo', async (t) => {
  const h = await harness(t, { mercadoPagoOrderId: 'ORD17', paymentMethod: 'mercado_pago' });
  assert.equal((await h.request('17/refresh-payment')).status, 200);
  assert.equal(h.row.paymentStatus, 'pending'); assert.equal(h.charges.length, 0);
  assert.equal((await h.request('17/complete')).status, 200);
  assert.equal(h.row.paymentStatus, 'pending');
});

test('verificar Order vencida habilita el cobro rápido, sin cobrar ni finalizar al consultar', async (t) => {
  const h = await harness(t, { mercadoPagoOrderId: 'ORD17', paymentMethod: 'mercado_pago' }, async () => ({ ...paidOrder, status: 'expired', total_paid_amount: '0.00' }));
  assert.equal((await h.request('17/refresh-payment')).status, 200);
  assert.equal(h.row.paymentStatus, 'cancelled'); assert.equal(h.row.status, 'pending'); assert.equal(h.charges.length, 0);
  assert.equal((await h.request('17/complete-and-charge', { method: 'transfer' })).status, 201);
  assert.equal(h.row.status, 'completed'); assert.equal(h.charges[0].method, 'transfer');
});

test('verificar checkout respeta permisos y errores de API sin cambios de estado', async (t) => {
  const h = await harness(t, { mercadoPagoOrderId: 'ORD17', paymentMethod: 'mercado_pago' }, async () => { throw new MercadoPagoError(404); });
  assert.equal((await h.request('17/refresh-payment', {}, 3)).status, 404);
  assert.equal((await h.request('17/refresh-payment', {}, 0)).status, 401);
  assert.equal((await h.request('17/refresh-payment', { status: 'paid' })).status, 400);
  assert.equal((await h.request('17/refresh-payment')).status, 502);
  assert.equal(h.row.paymentStatus, 'pending'); assert.equal(h.charges.length, 0);
});

test('acciones de tarjeta se adaptan al servicio, cobro y checkout sin ofrecer cobros indebidos', async () => {
  const { appointmentWorkflow } = await import('../../frontend/src/admin/appointmentWorkflow.js');
  for (const [overrides, primary, canCollect] of [
    [{}, 'combined', true], [{ status: 'completed' }, 'charge', true], [{ paymentStatus: 'paid' }, 'complete', false],
    [{ paymentStatus: 'paid', status: 'completed' }, null, false], [{ checkoutStarted: true }, 'complete', false],
    [{ checkoutStarted: true, status: 'completed' }, null, false], [{ status: 'cancelled' }, null, false], [{ status: 'no_show' }, null, false],
    [{ checkoutStarted: true, paymentStatus: 'cancelled' }, 'combined', true], [{ charge: { method: 'cash' } }, 'complete', false],
  ]) {
    const state = appointmentWorkflow({ status: 'pending', paymentStatus: 'pending', ...overrides });
    assert.equal(state.primary, primary); assert.equal(state.canCollect, canCollect);
  }
});
