'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
process.env.SESSION_SECRET ||= 'test-secret-that-is-at-least-32-characters-long';
const servicesRouter = require('../src/routes/services');
const barbersRouter = require('../src/routes/barbers');
const schedulesRouter = require('../src/routes/schedules');
const appointmentsRouter = require('../src/routes/appointments');
const customersRouter = require('../src/routes/customers');
const { AdminUser, Appointment, Barber, Customer, Service } = require('../src/models');

function createTestApp({ adminUserId } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = adminUserId ? { adminUserId } : {};
    next();
  });
  app.use('/api/services', servicesRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/appointments', appointmentsRouter);
  app.use('/api/barbers/:barberId/schedules', schedulesRouter);
  app.use('/api/barbers', barbersRouter);
  return app;
}

async function withServer(t, options, run) {
  const server = createTestApp(options).listen(0);
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  await new Promise((resolve) => server.once('listening', resolve));
  return run(`http://127.0.0.1:${server.address().port}`);
}

function mockAdmin(t, active = true) {
  return t.mock.method(AdminUser, 'findOne', async (options) => {
    assert.deepEqual(options.where, { id: 1, active: true });
    return active ? { id: 1, email: 'admin@example.com', active: true } : null;
  });
}

function validReservation() {
  const start = new Date(Date.now() + 6 * 60 * 60 * 1000);
  start.setUTCMinutes(0, 0, 0);
  return {
    customerId: 1,
    barberId: 1,
    serviceId: 1,
    startAt: `${start.toISOString().slice(0, 10)} ${start.toISOString().slice(11, 19)}`,
    status: 'confirmed',
  };
}

test('API privada rechaza llamadas sin sesión y sesiones de administradores inactivos', async (t) => {
  await withServer(t, {}, async (base) => {
    const appointments = await fetch(`${base}/api/appointments`);
    assert.equal(appointments.status, 401);
    const inactiveAdmin = mockAdmin(t, false);
    await withServer(t, { adminUserId: 1 }, async (adminBase) => {
      const response = await fetch(`${adminBase}/api/services?includeInactive=true`);
      assert.equal(response.status, 401);
    });
    assert.equal(inactiveAdmin.mock.callCount(), 1);
  });
});

test('servicios y barberos activos siguen públicos; includeInactive requiere sesión', async (t) => {
  const services = [{ id: 1, active: true }];
  const barbers = [{ id: 1, active: true }];
  t.mock.method(Service, 'findAll', async (options) => {
    assert.deepEqual(options.where, { active: true });
    return services;
  });
  t.mock.method(Barber, 'findAll', async (options) => {
    assert.deepEqual(options.where, { active: true });
    return barbers;
  });
  await withServer(t, {}, async (base) => {
    const serviceResponse = await fetch(`${base}/api/services`);
    const barberResponse = await fetch(`${base}/api/barbers`);
    assert.equal(serviceResponse.status, 200);
    assert.deepEqual(await serviceResponse.json(), services);
    assert.equal(barberResponse.status, 200);
    assert.deepEqual(await barberResponse.json(), barbers);
    assert.equal((await fetch(`${base}/api/services?includeInactive=true`)).status, 401);
    assert.equal((await fetch(`${base}/api/barbers?includeInactive=true`)).status, 401);
  });
});

test('sesión admin activa puede listar catálogos incluyendo inactivos', async (t) => {
  mockAdmin(t);
  const allServices = [{ id: 1, active: true }, { id: 2, active: false }];
  const allBarbers = [{ id: 1, active: true }, { id: 2, active: false }];
  t.mock.method(Service, 'findAll', async (options) => {
    assert.equal(Object.hasOwn(options, 'where'), false);
    return allServices;
  });
  t.mock.method(Barber, 'findAll', async (options) => {
    assert.equal(Object.hasOwn(options, 'where'), false);
    return allBarbers;
  });
  await withServer(t, { adminUserId: 1 }, async (base) => {
    const serviceResponse = await fetch(`${base}/api/services?includeInactive=true`);
    const barberResponse = await fetch(`${base}/api/barbers?includeInactive=true`);
    assert.equal(serviceResponse.status, 200);
    assert.deepEqual(await serviceResponse.json(), allServices);
    assert.equal(barberResponse.status, 200);
    assert.deepEqual(await barberResponse.json(), allBarbers);
  });
});

test('reserva pública ignora el status solicitado y siempre crea el turno como pending', async (t) => {
  t.mock.method(Customer, 'findByPk', async () => ({ id: 1 }));
  t.mock.method(Barber, 'findByPk', async () => ({ id: 1, active: true }));
  t.mock.method(Service, 'findByPk', async () => ({ id: 1, active: true, name: 'Corte', price: '12000.00' }));
  t.mock.method(Appointment, 'findOne', async () => null);
  const create = t.mock.method(Appointment, 'create', async (values) => ({ id: 99, ...values, reload: async () => {} }));
  await withServer(t, {}, async (base) => {
    const response = await fetch(`${base}/api/appointments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validReservation()),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).status, 'pending');
    assert.equal(create.mock.calls[0].arguments[0].status, 'pending');
  });
});

test('cambiar estado del turno requiere sesión y funciona con administrador activo', async (t) => {
  const unauthenticated = await (async () => {
    let status;
    await withServer(t, {}, async (base) => {
      status = (await fetch(`${base}/api/appointments/1`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      })).status;
    });
    return status;
  })();
  assert.equal(unauthenticated, 401);

  mockAdmin(t);
  const appointment = {
    id: 1, customerId: 1, barberId: 1, serviceId: 1, startAt: new Date(Date.now() + 6 * 60 * 60 * 1000), status: 'pending',
    async update(updates) { Object.assign(this, updates); return this; },
    async reload() { return this; },
  };
  t.mock.method(Appointment, 'findByPk', async () => appointment);
  await withServer(t, { adminUserId: 1 }, async (base) => {
    const response = await fetch(`${base}/api/appointments/1`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'confirmed');
  });
});

test('consultas de clientes requieren sesión activa de administrador', async (t) => {
  const noSession = await (async () => {
    let status;
    await withServer(t, {}, async (base) => { status = (await fetch(`${base}/api/customers`)).status; });
    return status;
  })();
  assert.equal(noSession, 401);

  mockAdmin(t);
  const customers = [{ id: 1, name: 'Cliente' }];
  t.mock.method(Customer, 'findAll', async () => customers);
  await withServer(t, { adminUserId: 1 }, async (base) => {
    const response = await fetch(`${base}/api/customers`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), customers);
  });
});
