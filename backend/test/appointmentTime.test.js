'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const express = require('express');
const { Op } = require('sequelize');
const { Appointment, AdminUser, Barber, Customer, Service, WorkingSchedule, sequelize } = require('../src/models');
const { businessTime, parseAppointmentTime, slotInstant } = require('../src/utils/appointmentTime');
const { isWithinReservationWindow } = require('../src/utils/reservationWindow');

const RealDate = Date;
function freeze(t, now) {
  const instant = RealDate.parse(now);
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  };
  t.after(() => { globalThis.Date = RealDate; });
}

async function harness(t, { now = '2026-10-28T11:00:00Z', day = '2026-10-28', startTime = '10:00:00', endTime = '19:00:00', stored = [] } = {}) {
  freeze(t, now);
  const rows = stored.map((item) => ({ barberId: 1, status: 'pending', ...item, startAt: new Date(item.startAt) }));
  const dayOfWeek = new Date(`${day}T12:00:00Z`).getUTCDay();
  t.mock.method(AdminUser, 'findOne', async ({ where }) => ({ id: where.id, active: true, role: where.id === 1 ? 'owner' : 'barber', barberId: where.id === 1 ? null : 1 }));
  t.mock.method(Barber, 'findOne', async () => ({ id: 1, active: true }));
  t.mock.method(Barber, 'findByPk', async () => ({ id: 1, active: true }));
  t.mock.method(Barber, 'findAll', async (options) => { assert.equal(options.lock, 'UPDATE'); return [{ id: 1, active: true }]; });
  t.mock.method(Service, 'findByPk', async () => ({ id: 1, name: 'Corte', price: '1000.00', active: true }));
  t.mock.method(WorkingSchedule, 'findOne', async ({ where }) => where.dayOfWeek === dayOfWeek ? { startTime, endTime } : null);
  t.mock.method(Customer, 'create', async (values) => ({ id: 1, ...values }));
  const ranges = [];
  t.mock.method(Appointment, 'findAll', async ({ where }) => {
    ranges.push(where.startAt);
    return rows.filter((item) => item.startAt >= where.startAt[Op.gte] && item.startAt < where.startAt[Op.lt]
      && (where.barberId === undefined || item.barberId === where.barberId)
      && (where.status ? item.status !== 'cancelled' : true));
  });
  t.mock.method(Appointment, 'findOne', async ({ where }) => {
    if (where.startAt) return rows.find((item) => item.barberId === where.barberId && item.startAt.getTime() === where.startAt.getTime() && item.status !== 'cancelled') || null;
    return rows.find((item) => item.id === where.id && item.barberId === where.barberId) || null;
  });
  t.mock.method(Appointment, 'findByPk', async (id) => rows.find((item) => item.id === id) || null);
  const create = t.mock.method(Appointment, 'create', async (values) => {
    const row = { id: rows.length + 10, ...values, async update(updates) { Object.assign(this, updates); return this; }, async reload() { return this; } };
    rows.push(row); return row;
  });
  // Serialize callbacks as the existing production barber row lock does.
  let tail = Promise.resolve();
  t.mock.method(sequelize, 'transaction', async (callback) => {
    const previous = tail; let release;
    tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); } finally { release(); }
  });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.session = req.headers['x-test-user'] ? { adminUserId: Number(req.headers['x-test-user']) } : {}; next(); });
  app.use('/api/availability', require('../src/routes/availability'));
  app.use('/api/appointments', require('../src/routes/appointments'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const availability = (date = day) => fetch(`${base}/api/availability?barberId=1&date=${date}`).then((response) => response.json());
  const book = (startAt, extra = {}) => fetch(`${base}/api/appointments`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customer: { name: 'Cliente', phone: '1234', email: 'test@example.com' }, barberId: 1, serviceId: 1, paymentMethod: 'cash', startAt, ...extra }) });
  return { base, rows, create, ranges, availability, book };
}

test('10:00 elegido en disponibilidad se envía como 13:00Z, se guarda y se presenta como 10:00 para dueño y barbero', async (t) => {
  const { availability, book, base, create } = await harness(t);
  const { bookingStartAt } = await import('../../frontend/src/utils/bookingTime.js');
  const { formatAgendaDate, formatAgendaTime } = await import('../../frontend/src/admin/agendaTime.js');
  const available = await availability();
  assert.ok(available.availableSlots.includes('10:00'));
  const startAt = bookingStartAt('2026-10-28', '10:00', available.slotStartsAt);
  assert.equal(startAt, '2026-10-28T13:00:00.000Z');
  const response = await book(startAt);
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.startAt, startAt);
  assert.equal(created.endAt, '2026-10-28T14:00:00.000Z');
  assert.equal(create.mock.calls[0].arguments[0].startAt.toISOString(), startAt);
  for (const user of [1, 2]) {
    const agenda = await fetch(`${base}/api/appointments?agendaDate=2026-10-28`, { headers: { 'x-test-user': String(user) } });
    assert.equal(agenda.status, 200);
    const [appointment] = await agenda.json();
    assert.equal(appointment.id, created.id);
    assert.match(formatAgendaDate(appointment.startAt), /28\/10\/2026.*10:00/);
    assert.equal(formatAgendaTime(appointment.startAt), '10:00');
  }
  assert.equal((await availability()).availableSlots.includes('10:00'), false);
});

test('hora y día laborales se calculan en Argentina incluso si UTC ya está en el día siguiente', async (t) => {
  const { availability, book, base } = await harness(t, { day: '2026-10-30', now: '2026-10-30T15:00:00Z', startTime: '20:00:00', endTime: '23:00:00' });
  const available = await availability();
  assert.deepEqual(available.availableSlots, ['20:00', '21:00', '22:00']);
  assert.equal(available.slotStartsAt['22:00'], '2026-10-31T01:00:00.000Z');
  assert.equal((await book(available.slotStartsAt['22:00'])).status, 201);
  for (const day of ['2026-10-30', '2026-10-31']) {
    const result = await (await fetch(`${base}/api/appointments?agendaDate=${day}`, { headers: { 'x-test-user': '1' } })).json();
    assert.equal(result.length, day === '2026-10-30' ? 1 : 0);
  }
});

test('ocupación histórica usa instantes guardados, con inicio inclusivo y fin exclusivo del día argentino', async (t) => {
  const stored = [
    { id: 1, startAt: '2026-10-28T02:00:00Z' }, // 23:00 del día anterior
    { id: 2, startAt: '2026-10-28T03:00:00Z' }, // 00:00 del día consultado
    { id: 3, startAt: '2026-10-29T03:00:00Z' }, // 00:00 del día siguiente
  ];
  const { availability, rows, ranges, base } = await harness(t, { now: '2026-10-27T20:00:00Z', startTime: '00:00:00', endTime: '02:00:00', stored });
  const before = rows.map((item) => item.startAt.toISOString());
  const result = await availability();
  assert.deepEqual(result.availableSlots, ['01:00']);
  assert.equal(ranges[0][Op.gte].toISOString(), '2026-10-28T03:00:00.000Z');
  assert.equal(ranges[0][Op.lt].toISOString(), '2026-10-29T03:00:00.000Z');
  const agenda = await (await fetch(`${base}/api/appointments?agendaDate=2026-10-28`, { headers: { 'x-test-user': '2' } })).json();
  assert.deepEqual(agenda.map((item) => item.id), [2]);
  assert.deepEqual(rows.map((item) => item.startAt.toISOString()), before);
});

test('mínimo de dos horas se aplica al instante local real tanto en disponibilidad como en creación', async (t) => {
  const { availability, book } = await harness(t, { now: '2026-10-28T11:00:00.001Z' });
  const result = await availability();
  assert.equal(result.availableSlots.includes('10:00'), false);
  assert.equal(result.availableSlots.includes('11:00'), true);
  assert.equal((await book('2026-10-28T10:00:00-03:00')).status, 400);
  assert.equal((await book(result.slotStartsAt['11:00'])).status, 201);
});

test('máximo de treinta días: acepta el límite exacto y rechaza la hora siguiente', async (t) => {
  const { availability, book } = await harness(t, { now: '2026-10-28T13:00:00Z', day: '2026-11-27' });
  const result = await availability();
  assert.deepEqual(result.availableSlots, ['10:00']);
  assert.equal((await book(result.slotStartsAt['10:00'])).status, 201);
  assert.equal((await book('2026-11-27T11:00:00-03:00')).status, 400);
});

test('cierre del horario laboral y solicitudes con zonas o calendarios inválidos siguen rechazados', async (t) => {
  const { availability, book, create } = await harness(t);
  assert.equal((await availability()).availableSlots.includes('19:00'), false);
  for (const time of ['2026-10-28T19:00:00-03:00', '2026-10-28T10:30:00-03:00', '2026-02-30T10:00:00-03:00',
    '2026-10-28T10:00:00-25:00', '2026-10-28T10:00:00+14:01', '2026-10-28T10:00:00Zjunk']) {
    assert.equal((await book(time)).status, 400, time);
  }
  assert.equal(create.mock.callCount(), 0);
});

test('UTC, offset explícito y formato legado representan el mismo instante y no permiten reservas simultáneas duplicadas', async (t) => {
  const { book, rows } = await harness(t);
  const requests = ['2026-10-28T10:00:00-03:00', '2026-10-28T13:00:00Z', '2026-10-28 13:00:00'];
  const responses = await Promise.all(requests.map((time) => book(time)));
  assert.deepEqual(responses.map((item) => item.status).sort(), [201, 409, 409]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].startAt.toISOString(), '2026-10-28T13:00:00.000Z');
});

test('reprogramación del dueño valida horario y guarda UTC; cambiar solo estado no desplaza el turno', async (t) => {
  const { book, base, rows } = await harness(t);
  await book('2026-10-28T10:00:00-03:00');
  const update = (body) => fetch(`${base}/api/appointments/${rows[0].id}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-test-user': '1' }, body: JSON.stringify(body) });
  assert.equal((await update({ startAt: '2026-10-28T18:00:00-03:00' })).status, 200);
  assert.equal(rows[0].startAt.toISOString(), '2026-10-28T21:00:00.000Z');
  assert.equal((await update({ startAt: '2026-10-28T19:00:00-03:00' })).status, 400);
  assert.equal((await update({ status: 'confirmed' })).status, 200);
  assert.equal(rows[0].startAt.toISOString(), '2026-10-28T21:00:00.000Z');
});

test('histórico fuera del horario local conserva el instante al confirmar y sigue bloqueando ese mismo instante', async (t) => {
  const { rows, base, book } = await harness(t, { stored: [{ id: 7, startAt: '2026-10-28T10:00:00Z',
    async update(updates) { Object.assign(this, updates); return this; }, async reload() { return this; } }] });
  const response = await fetch(`${base}/api/appointments/7`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-test-user': '1' }, body: JSON.stringify({ status: 'confirmed' }) });
  assert.equal(response.status, 200);
  assert.equal(rows[0].startAt.toISOString(), '2026-10-28T10:00:00.000Z');
  // Existing valid local bookings are also honored, including legacy bare UTC calls.
  assert.equal((await book('2026-10-28 13:00:00')).status, 201);
  assert.equal((await book('2026-10-28T10:00:00-03:00')).status, 409);
});

test('conversión local respeta horario histórico y rechaza la medianoche inexistente del cambio de hora', () => {
  assert.equal(slotInstant('2008-10-19', '10:00').toISOString(), '2008-10-19T12:00:00.000Z');
  assert.equal(slotInstant('2008-10-19', '00:00'), null);
  assert.equal(slotInstant('2026-10-28', '24:00'), null);
  assert.equal(slotInstant('2026-02-30', '10:00'), null);
  assert.equal(businessTime(new Date('2026-10-31T01:00:00Z')).dayOfWeek, 5);
});

test('límites instantáneos de anticipación no cambian al cruzar la medianoche argentina', () => {
  const now = new Date('2026-10-29T01:00:00Z'); // 22:00 del 28
  const midnight = slotInstant('2026-10-29', '00:00');
  assert.equal(isWithinReservationWindow(midnight, now), true);
  assert.equal(isWithinReservationWindow(midnight, new Date(now.getTime() + 1)), false);
  assert.equal(parseAppointmentTime('2026-10-29 03:00:00').getTime(), midnight.getTime());
});

test('selección, límites y presentación no dependen de la zona del navegador o del proceso', () => {
  const script = `
    const assert = require('node:assert/strict');
    (async () => {
      const { bookingDateLimits, bookingStartAt, formatBookingDate } = await import('./frontend/src/utils/bookingTime.js');
      const { formatAgendaDate, formatAgendaTime } = await import('./frontend/src/admin/agendaTime.js');
      assert.deepEqual(bookingDateLimits(new Date('2026-10-29T02:59:59Z')), {today:'2026-10-28',maxDate:'2026-11-27'});
      assert.equal(bookingDateLimits(new Date('2026-10-29T03:00:00Z')).today, '2026-10-29');
      const startAt = bookingStartAt('2026-10-28','10:00',{'10:00':'2026-10-28T13:00:00.000Z'});
      assert.match(formatAgendaDate(startAt), /10:00/);
      assert.equal(formatAgendaTime(startAt), '10:00');
      assert.match(formatBookingDate('2026-10-28'), /28/);
      assert.throws(() => bookingStartAt('2026-10-28','10:00',{}));
      assert.throws(() => bookingStartAt('2026-10-28','10:00',{'10:00':'2026-10-28T10:00:00.000Z'}));
    })().catch(() => process.exit(1));`;
  const cwd = require('node:path').resolve(__dirname, '../..');
  for (const TZ of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'America/Argentina/Buenos_Aires']) {
    execFileSync(process.execPath, ['-e', script], { cwd, env: { ...process.env, TZ }, stdio: 'pipe' });
  }
});
