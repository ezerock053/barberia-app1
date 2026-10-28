'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const { AdminUser, Barber, Appointment, Service, sequelize } = require('../src/models');

async function harness(t, { role = 'barber', barberId = 2, userActive = true, barberActive = true, loggedIn = true } = {}) {
  const user = { id: 7, email: 'staff@example.com', active: userActive, role, barberId };
  t.mock.method(AdminUser, 'findOne', async () => user.active ? user : null);
  t.mock.method(Barber, 'findOne', async ({ where }) => barberActive && where.id === 2 ? { id: 2, active: true } : null);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = loggedIn ? { adminUserId: 7 } : {}; next(); });
  app.use('/api/appointments', require('../src/routes/appointments'));
  app.use('/api/services', require('../src/routes/services'));
  app.use('/api/barbers/:barberId/schedules', require('../src/routes/schedules'));
  app.use('/api/barbers', require('../src/routes/barbers'));
  app.use('/api/customers', require('../src/routes/customers'));
  app.use('/api/users', require('../src/routes/users'));
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, user };
}

test('barbero solo lista su barberId aunque el cliente manipule filtros', async (t) => {
  const query = t.mock.method(Appointment, 'findAll', async ({ where }) => {
    assert.equal(where.barberId, 2);
    return [{ id: 10, barberId: 2 }];
  });
  const { base } = await harness(t);
  for (const suffix of ['', '?barberId=2', '?role=owner&userId=1']) {
    const response = await fetch(`${base}/api/appointments${suffix}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ id: 10, barberId: 2, checkoutStarted: false }]);
  }
  assert.equal((await fetch(`${base}/api/appointments?barberId=3`)).status, 403);
  assert.equal((await fetch(`${base}/api/appointments?barberId=2&barberId=3`)).status, 400);
  assert.equal(query.mock.callCount(), 3);
});

test('consulta por ID incluye propiedad en SQL y oculta turnos ajenos', async (t) => {
  t.mock.method(Appointment, 'findByPk', async () => { assert.fail('Barbero no debe consultar sin alcance'); });
  t.mock.method(Appointment, 'findOne', async ({ where }) => {
    assert.equal(where.barberId, 2);
    return where.id === 10 ? { id: 10, barberId: 2 } : null;
  });
  const { base } = await harness(t);
  assert.equal((await fetch(`${base}/api/appointments/10`)).status, 200);
  assert.equal((await fetch(`${base}/api/appointments/11`)).status, 404);
  assert.equal((await fetch(`${base}/api/appointments/11?barberId=3`)).status, 404);
});

test('barbero no modifica ni cancela turnos propios o ajenos ni administra catálogos, clientes o usuarios', async (t) => {
  const transaction = t.mock.method(sequelize, 'transaction', async () => { assert.fail('Operación no autorizada'); });
  const { base } = await harness(t);
  const paths = [
    ['PUT', '/appointments/10'], ['PUT', '/appointments/11'], ['DELETE', '/appointments/10'], ['DELETE', '/appointments/11'],
    ['POST', '/services'], ['PUT', '/services/1'], ['DELETE', '/services/1'],
    ['POST', '/barbers'], ['PUT', '/barbers/3'], ['DELETE', '/barbers/3'],
    ['GET', '/barbers/3/schedules'], ['POST', '/barbers/3/schedules'], ['PUT', '/barbers/3/schedules/1'], ['DELETE', '/barbers/3/schedules/1'],
    ['GET', '/services?includeInactive=true'], ['GET', '/barbers?includeInactive=true'],
    ['GET', '/customers'], ['GET', '/customers/1'], ['PUT', '/customers/1'], ['DELETE', '/customers/1'],
    ['GET', '/users'], ['POST', '/users'],
  ];
  for (const [method, path] of paths) {
    const response = await fetch(`${base}/api${path}`, { method,
      ...(method === 'POST' || method === 'PUT' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'owner', barberId: 3, status: 'completed' }) } : {}),
    });
    assert.equal(response.status, 403, `${method} ${path}`);
  }
  assert.equal(transaction.mock.callCount(), 0);
});

test('sesión vuelve a comprobar rol y vínculo en cada solicitud', async (t) => {
  t.mock.method(Appointment, 'findAll', async ({ where }) => {
    assert.equal(where.barberId, 2);
    return [];
  });
  const { base, user } = await harness(t);
  assert.equal((await fetch(`${base}/api/appointments`)).status, 200);
  user.barberId = null;
  assert.equal((await fetch(`${base}/api/appointments`)).status, 401);
  user.role = 'unknown';
  assert.equal((await fetch(`${base}/api/appointments`)).status, 401);
  user.role = 'owner';
  t.mock.method(Service, 'findAll', async () => []);
  assert.equal((await fetch(`${base}/api/services?includeInactive=true`)).status, 200);
  user.active = false;
  assert.equal((await fetch(`${base}/api/appointments`)).status, 401);
});

test('barbero desactivado no conserva acceso con una sesión existente', async (t) => {
  const { base } = await harness(t, { barberActive: false });
  assert.equal((await fetch(`${base}/api/appointments`)).status, 401);
});

test('dueño mantiene todos los turnos y la consulta directa por ID', async (t) => {
  t.mock.method(Appointment, 'findAll', async ({ where }) => {
    assert.equal(where.barberId, undefined);
    return [{ id: 10, barberId: 2 }, { id: 11, barberId: 3 }];
  });
  t.mock.method(Appointment, 'findByPk', async (id) => ({ id, barberId: 3 }));
  const { base } = await harness(t, { role: 'owner', barberId: null });
  assert.equal((await (await fetch(`${base}/api/appointments`)).json()).length, 2);
  assert.equal((await fetch(`${base}/api/appointments/11`)).status, 200);
});

test('agendaDate usa el día de Buenos Aires sobre instantes UTC sin alterar datos', async (t) => {
  t.mock.method(Appointment, 'findAll', async ({ where }) => {
    assert.equal(where.startAt[Op.gte].toISOString(), '2026-10-28T03:00:00.000Z');
    assert.equal(where.startAt[Op.lt].toISOString(), '2026-10-29T03:00:00.000Z');
    return [];
  });
  const { base } = await harness(t);
  assert.equal((await fetch(`${base}/api/appointments?agendaDate=2026-10-28`)).status, 200);
  for (const query of ['agendaDate=2026-02-30', 'agendaDate=2026-10-28&from=2026-10-28', 'agendaDate=bad']) {
    assert.equal((await fetch(`${base}/api/appointments?${query}`)).status, 400);
  }
});

test('sin sesión no se consultan agendas ni se crean usuarios', async (t) => {
  const { base } = await harness(t, { loggedIn: false });
  for (const path of ['/appointments', '/appointments/10', '/users']) {
    assert.equal((await fetch(`${base}/api${path}`)).status, 401);
  }
});

test('dueño puede crear acceso vinculado y nunca recibe el hash', async (t) => {
  const { base } = await harness(t, { role: 'owner', barberId: null });
  t.mock.method(bcrypt, 'hash', async (_password, rounds) => { assert.equal(rounds, 12); return 'hashed-test-password'; });
  t.mock.method(sequelize, 'transaction', async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
  t.mock.method(AdminUser, 'create', async (values) => {
    assert.equal(values.role, 'barber');
    assert.equal(values.barberId, 2);
    assert.equal(values.passwordHash, 'hashed-test-password');
    assert.equal(values.password, undefined);
    return { id: 8, ...values };
  });
  const response = await fetch(`${base}/api/users`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'BARBER@example.com', password: 'test-password-123', role: 'barber', barberId: 2 }) });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { user: { id: 8, email: 'barber@example.com', role: 'barber', barberId: 2 } });
});

test('creación rechaza vínculo ausente, inexistente, inactivo, rol inválido o duplicado', async (t) => {
  const { base } = await harness(t, { role: 'owner', barberId: null });
  t.mock.method(bcrypt, 'hash', async () => 'hashed-test-password');
  t.mock.method(sequelize, 'transaction', async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
  t.mock.method(AdminUser, 'create', async () => { const error = new Error(); error.name = 'SequelizeUniqueConstraintError'; throw error; });
  const payload = { email: 'barber@example.com', password: 'test-password-123', role: 'barber', barberId: 2 };
  for (const [changes, status] of [
    [{ barberId: null }, 400], [{ barberId: 3 }, 400], [{ barberId: -1 }, 400], [{ role: 'owner' }, 400],
    [{ role: 'invalid' }, 400], [{ password: 'short' }, 400], [{}, 409],
  ]) {
    const response = await fetch(`${base}/api/users`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, ...changes }) });
    assert.equal(response.status, status);
  }
});

test('modelo impide roles y vínculos incompatibles sin persistir', async () => {
  for (const values of [{ role: 'barber', barberId: null }, { role: 'barber', barberId: -1 }, { role: 'owner', barberId: 2 }, { role: 'invalid', barberId: null }]) {
    const user = AdminUser.build({ email: 'staff@example.com', passwordHash: 'hash', ...values });
    await assert.rejects(user.validate());
  }
});

test('dueño no puede crear un acceso vinculado a un barbero inactivo', async (t) => {
  const { base } = await harness(t, { role: 'owner', barberId: null, barberActive: false });
  t.mock.method(bcrypt, 'hash', async () => 'hashed-test-password');
  t.mock.method(sequelize, 'transaction', async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
  const create = t.mock.method(AdminUser, 'create', async () => { assert.fail('No debe crear acceso'); });
  const response = await fetch(`${base}/api/users`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'barber@example.com', password: 'test-password-123', role: 'barber', barberId: 2 }) });
  assert.equal(response.status, 400);
  assert.equal(create.mock.callCount(), 0);
});

test('listado de usuarios del dueño solicita solamente atributos públicos', async (t) => {
  const { base } = await harness(t, { role: 'owner', barberId: null });
  t.mock.method(AdminUser, 'findAll', async ({ attributes }) => {
    assert.deepEqual(attributes, ['id', 'email', 'role', 'barberId', 'active']);
    return [{ id: 7, email: 'staff@example.com', role: 'owner', barberId: null, active: true }];
  });
  const response = await fetch(`${base}/api/users`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).length, 1);
});

test('presentación de agenda usa Buenos Aires independientemente del navegador', async () => {
  const { agendaDateString, formatAgendaDate, AGENDA_TIME_ZONE } = await import('../../frontend/src/admin/agendaTime.js');
  assert.equal(AGENDA_TIME_ZONE, 'America/Argentina/Buenos_Aires');
  assert.equal(agendaDateString(new Date('2026-10-29T02:59:59Z')), '2026-10-28');
  assert.equal(agendaDateString(new Date('2026-10-29T03:00:00Z')), '2026-10-29');
  assert.match(formatAgendaDate('2026-10-28T14:00:00Z'), /11:00/);
});
