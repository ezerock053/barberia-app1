'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Op, Transaction } = require('sequelize');
const { createReportsRouter } = require('../src/routes/reports');
const { createRequireAdmin } = require('../src/middleware/requireAdmin');
const { businessDate, validDate, businessDayRange } = require('../src/utils/businessDay');
const { buildDailyReport } = require('../src/utils/dailyReport');

const date = '2026-10-28';
const barbers = [{ id: 1, name: 'Ana', active: true }, { id: 2, name: 'Bruno', active: false }, { id: 3, name: 'Ciro', active: true }];
function appointment(id, extra = {}) {
  return { id, barberId: 1, barber: barbers[0], customer: { name: 'Cliente' }, serviceName: 'Corte', servicePrice: '1000.00',
    status: 'completed', completedAt: '2026-10-28T15:00:00Z', paymentStatus: 'pending', charge: null, ...extra };
}
function charge(id, extra = {}) {
  return { id, appointmentId: id, amount: '1000.00', currency: 'ARS', method: 'cash', dateSource: 'operator',
    paidAt: '2026-10-28T15:00:00Z', appointment: appointment(id, { paymentStatus: 'paid' }), ...extra };
}
function report(extra = {}) { return buildDailyReport({ date, charges: [], completed: [], barbers, ...extra }); }

test('día argentino: medianoche inclusiva y siguiente día exclusivo, independientemente del TZ del proceso', () => {
  const range = businessDayRange(date);
  assert.equal(range.start.toISOString(), '2026-10-28T03:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-10-29T03:00:00.000Z');
  assert.equal(businessDate(new Date('2026-10-29T02:59:59.999Z')), date);
  assert.equal(businessDate(range.end), '2026-10-29');
});
test('fechas históricas usan el cambio de horario real de Buenos Aires', () => {
  const { start, end } = businessDayRange('2008-10-19');
  assert.equal(start.toISOString(), '2008-10-19T03:00:00.000Z');
  assert.equal(end.toISOString(), '2008-10-20T02:00:00.000Z');
  assert.equal(end - start, 23 * 3600000);
});
test('valida calendario estricto, incluyendo bisiestos y tipos manipulados', () => {
  for (const value of ['2026-02-30', '2026-02-29', '28/10/2026', '', '0000-01-01', [], null, '2026-1-01']) assert.equal(validDate(value), false);
  assert.equal(validDate('2024-02-29'), true);
});
test('suma importes reales por método con centavos exactos; no infiere ingresos de servicios', () => {
  const result = report({ charges: [charge(1, { amount: '0.10' }), charge(2, { amount: '0.20', method: 'transfer' }),
    charge(3, { amount: '1234.56', method: 'mercado_pago', dateSource: 'provider_update' })], completed: [appointment(9)] });
  assert.equal(result.totals.collected, '1234.86');
  assert.equal(result.totals.completedValue, '1000.00');
  assert.equal(result.totals.byMethod.cash.amount, '0.10');
  assert.equal(result.totals.byMethod.transfer.amount, '0.20');
  assert.equal(result.totals.byMethod.mercado_pago.amount, '1234.56');
  assert.equal(result.warnings.providerDateCount, 1);
  assert.equal(result.gross, true);
});
test('pendientes usan estado actual: excluye pagados históricos y cobros registrados en cualquier fecha', () => {
  const result = report({ completed: [appointment(1), appointment(2, { paymentStatus: 'paid' }),
    appointment(3, { charge: { id: 8 } }), appointment(4, { paymentStatus: 'paid', charge: { id: 9 } })] });
  assert.equal(result.totals.completedCount, 4);
  assert.equal(result.totals.outstandingCount, 1);
  assert.equal(result.totals.outstandingValue, '1000.00');
  assert.equal(result.totals.collected, '0.00');
  assert.equal(result.warnings.inconsistentPaymentStates, 1);
});
test('incluye barbero inactivo con actividad y activo sin actividad; no mezcla importes de servicios y cobros', () => {
  const result = report({ charges: [charge(1)], completed: [appointment(2, { barberId: 2, barber: barbers[1], servicePrice: '2500.50' })] });
  assert.equal(result.barbers.length, 3);
  assert.equal(result.barbers[0].collected, '1000.00');
  assert.equal(result.barbers[0].completedCount, 0);
  assert.equal(result.barbers[1].completedValue, '2500.50');
  assert.equal(result.barbers[1].collected, '0.00');
  assert.equal(result.barbers[2].completedCount, 0);
});
test('no duplica una fila repetida de cobro o servicio; rechaza cobros diferentes para el mismo turno', () => {
  const result = report({ charges: [charge(1), charge(1)], completed: [appointment(1), appointment(1)] });
  assert.equal(result.totals.collectedCount, 1);
  assert.equal(result.totals.completedCount, 1);
  assert.throws(() => report({ charges: [charge(1), charge(2, { appointmentId: 1 })] }));
});
test('sin datos devuelve ceros y advierte históricos sin imputarlos a fechas o métodos', () => {
  const result = report({ historical: { completedWithoutDate: 2, paidWithoutCharge: 3 } });
  assert.equal(result.totals.collected, '0.00');
  assert.equal(result.totals.completedCount, 0);
  assert.equal(result.totals.byMethod.mercado_pago.count, 0);
  assert.deepEqual(result.historical, { completedWithoutDate: 2, paidWithoutCharge: 3 });
});
test('datos monetarios inválidos no se convierten silenciosamente en ingresos', () => {
  for (const extra of [{ amount: '-1' }, { amount: 'NaN' }, { amount: '0' }, { method: 'unknown' }, { currency: 'USD' }]) {
    assert.throws(() => report({ charges: [charge(1, extra)] }));
  }
});

async function harness(t, { role = 'owner', loggedIn = true, active = true, charges = [], completed = [], fail = false } = {}) {
  let queries = 0; let transactions = 0;
  const transaction = {};
  const rangeFilter = (value, range) => value && new Date(value) >= range[Op.gte] && new Date(value) < range[Op.lt];
  function verify(options) { assert.equal(options.transaction, transaction); queries++; }
  const AppointmentModel = {
    async findAll(options) { verify(options); assert.equal(options.where.status, 'completed');
      return completed.filter((item) => item.status === 'completed' && rangeFilter(item.completedAt, options.where.completedAt)); },
    async count(options) { verify(options); return options.where.status === 'completed' ? 2 : 3; },
  };
  const ChargeModel = { async findAll(options) { verify(options); if (fail) throw new Error('Private database information');
    return charges.filter((item) => rangeFilter(item.paidAt, options.where.paidAt)); } };
  const BarberModel = { async findAll(options) { verify(options); return barbers; }, async findOne() { return { id: 1 }; } };
  const authorize = createRequireAdmin({ async findOne() { return { id: 7, active, role, barberId: role === 'owner' ? null : 1 }; } }, BarberModel);
  const sequelizeInstance = { async transaction(options, callback) {
    transactions++;
    assert.equal(options.isolationLevel, Transaction.ISOLATION_LEVELS.REPEATABLE_READ);
    assert.equal(options.readOnly, true);
    return callback(transaction);
  } };
  const app = express();
  app.use((req, _res, next) => { req.session = loggedIn ? { adminUserId: 7 } : {}; next(); });
  app.use('/reports', createReportsRouter({ AppointmentModel, ChargeModel, BarberModel, CustomerModel: {}, authorize,
    sequelizeInstance, now: () => new Date('2026-10-29T02:30:00Z') }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}/reports/daily`, counts: () => ({ queries, transactions }) };
}
test('endpoint filtra cobros por paidAt y servicios por completedAt; incluye límites correctos y omite reservas pendientes', async (t) => {
  const { url, counts } = await harness(t, {
    charges: [charge(1, { paidAt: '2026-10-28T02:59:59.999Z' }), charge(2, { paidAt: '2026-10-28T03:00:00Z',
      appointment: appointment(2, { completedAt: '2026-10-27T15:00:00Z' }) }),
    charge(3, { paidAt: '2026-10-29T02:59:59.999Z', method: 'transfer' }), charge(4, { paidAt: '2026-10-29T03:00:00Z' })],
    completed: [appointment(5, { completedAt: '2026-10-28T03:00:00Z' }), appointment(6, { completedAt: '2026-10-29T03:00:00Z' }),
      appointment(7, { status: 'pending' }), appointment(8, { completedAt: null }),
      appointment(9, { completedAt: '2026-10-29T02:59:59.999Z', paymentStatus: 'paid', charge: { id: 20 } })],
  });
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.date, date);
  assert.deepEqual(result.collections.map((item) => item.id), [2, 3]);
  assert.deepEqual(result.services.map((item) => item.id), [5, 9]);
  assert.equal(result.totals.collected, '2000.00');
  assert.equal(result.totals.outstandingCount, 1);
  assert.deepEqual(counts(), { queries: 5, transactions: 1 });
});
test('dueño puede consultar fecha pasada y datos históricos sin cobros', async (t) => {
  const { url } = await harness(t);
  const response = await fetch(`${url}?date=2008-10-19`);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.date, '2008-10-19');
  assert.equal(result.totals.collected, '0.00');
  assert.equal(result.historical.paidWithoutCharge, 3);
});
test('un cobro posterior deja de ser pendiente en el reporte anterior, sin agregar ingresos a ese día', async (t) => {
  const { url } = await harness(t, { charges: [charge(1, { paidAt: '2026-10-28T15:00:00Z' })],
    completed: [appointment(1, { completedAt: '2026-10-27T15:00:00Z', paymentStatus: 'paid', charge: { id: 1 } })] });
  const prior = await (await fetch(`${url}?date=2026-10-27`)).json();
  assert.equal(prior.totals.completedCount, 1);
  assert.equal(prior.totals.collectedCount, 0);
  assert.equal(prior.totals.outstandingCount, 0);
  const current = await (await fetch(url)).json();
  assert.equal(current.totals.completedCount, 0);
  assert.equal(current.totals.collectedCount, 1);
});
test('rechaza fechas inválidas, futuras, repetidas y filtros adicionales antes de consultar datos', async (t) => {
  const { url, counts } = await harness(t);
  for (const suffix of ['?date=2026-02-30', '?date=2026-10-29', '?date=', '?date=2026-10-28&date=2026-10-27', '?barberId=1', '?role=owner']) {
    assert.equal((await fetch(`${url}${suffix}`)).status, 400, suffix);
  }
  assert.deepEqual(counts(), { queries: 0, transactions: 0 });
});
for (const [name, options, expected] of [['barbero', { role: 'barber' }, 403], ['anónimo', { loggedIn: false }, 401], ['inactivo', { active: false }, 401]]) {
  test(`reportes globales bloqueados para ${name} aunque manipule rol o barberId`, async (t) => {
    const { url, counts } = await harness(t, options);
    assert.equal((await fetch(`${url}?role=owner&barberId=1`)).status, expected);
    assert.deepEqual(counts(), { queries: 0, transactions: 0 });
  });
}
test('errores de lectura se devuelven sin datos internos', async (t) => {
  const { url } = await harness(t, { fail: true });
  const response = await fetch(url);
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /Private|database/);
});
