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
const { AdminUser, Appointment, Barber, Customer, Service, WorkingSchedule, sequelize } = require('../src/models');

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
    customer: { name: 'Cliente de prueba', phone: '1111111111', email: 'cliente@example.com' },
    barberId: 1,
    serviceId: 1,
    startAt: `${start.toISOString().slice(0, 10)} ${start.toISOString().slice(11, 19)}`,
    paymentMethod: 'cash',
    status: 'confirmed',
  };
}

function mockTransaction(t) {
  return t.mock.method(sequelize, 'transaction', async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }));
}

function scheduleFor(startAt) {
  return { barberId: 1, dayOfWeek: startAt.getUTCDay(), startTime: '00:00:00', endTime: '23:59:59' };
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

test('reserva pública con efectivo crea cliente y turno en una transacción, ignora status y devuelve solo confirmación mínima', async (t) => {
  mockTransaction(t);
  const barberLock = t.mock.method(Barber, 'findAll', async (options) => {
    assert.equal(options.lock, 'UPDATE');
    return [{ id: 1, active: true }];
  });
  const startAt = new Date(`${validReservation().startAt.replace(' ', 'T')}Z`);
  t.mock.method(WorkingSchedule, 'findOne', async () => scheduleFor(startAt));
  t.mock.method(Customer, 'create', async (values, options) => {
    assert.ok(options.transaction);
    return { id: 31, ...values };
  });
  t.mock.method(Service, 'findByPk', async (_id, options) => {
    assert.ok(options.transaction);
    return { id: 1, active: true, name: 'Corte', price: '12000.00' };
  });
  t.mock.method(Appointment, 'findOne', async () => null);
  const create = t.mock.method(Appointment, 'create', async (values, options) => {
    assert.ok(options.transaction);
    return { id: 99, ...values };
  });
  await withServer(t, {}, async (base) => {
    const booking = validReservation();
    booking.barberId = '1';
    booking.serviceId = '1';
    const response = await fetch(`${base}/api/appointments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(booking),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['endAt', 'id', 'startAt']);
    assert.equal(JSON.stringify(body).includes('cliente@example.com'), false);
    assert.equal(barberLock.mock.callCount(), 1);
    assert.equal(create.mock.calls[0].arguments[0].status, 'pending');
    assert.equal(create.mock.calls[0].arguments[0].paymentStatus, 'pending');
    assert.equal(create.mock.calls[0].arguments[0].paymentMethod, 'cash');
    assert.equal(create.mock.calls[0].arguments[0].customerId, 31);
    assert.equal(create.mock.calls[0].arguments[0].barberId, 1);
    assert.equal(create.mock.calls[0].arguments[0].serviceId, 1);
  });
});

test('reserva pública con Mercado Pago comienza con pago pendiente', async (t) => {
  mockTransaction(t);
  const startAt = new Date(`${validReservation().startAt.replace(' ', 'T')}Z`);
  t.mock.method(Barber, 'findAll', async () => [{ id: 1, active: true }]);
  t.mock.method(WorkingSchedule, 'findOne', async () => scheduleFor(startAt));
  t.mock.method(Service, 'findByPk', async () => ({ id: 1, active: true, name: 'Corte', price: '12000.00' }));
  t.mock.method(Appointment, 'findOne', async () => null);
  t.mock.method(Customer, 'create', async () => ({ id: 31 }));
  const create = t.mock.method(Appointment, 'create', async (values) => ({ id: 99, ...values }));
  await withServer(t, {}, async (base) => {
    const response = await fetch(`${base}/api/appointments`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validReservation(), paymentMethod: 'mercado_pago' }),
    });
    assert.equal(response.status, 201);
    assert.equal(create.mock.calls[0].arguments[0].paymentMethod, 'mercado_pago');
    assert.equal(create.mock.calls[0].arguments[0].paymentStatus, 'pending');
    assert.equal(create.mock.calls[0].arguments[0].status, 'pending');
  });
});

test('reserva pública rechaza método de pago inválido', async (t) => {
  const createCustomer = t.mock.method(Customer, 'create', async () => ({ id: 1 }));
  await withServer(t, {}, async (base) => {
    const response = await fetch(`${base}/api/appointments`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validReservation(), paymentMethod: 'crypto' }),
    });
    assert.equal(response.status, 400);
    assert.equal(createCustomer.mock.callCount(), 0);
  });
});

test('reserva pública rechaza paymentStatus enviado por el cliente', async (t) => {
  const createCustomer = t.mock.method(Customer, 'create', async () => ({ id: 1 }));
  await withServer(t, {}, async (base) => {
    const response = await fetch(`${base}/api/appointments`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validReservation(), paymentStatus: 'paid' }),
    });
    assert.equal(response.status, 400);
    assert.equal(createCustomer.mock.callCount(), 0);
  });
});

test('reserva pública rechaza customerId arbitrario sin crear cliente ni turno', async (t) => {
  const customerCreate = t.mock.method(Customer, 'create', async () => ({ id: 1 }));
  const appointmentCreate = t.mock.method(Appointment, 'create', async () => ({ id: 1 }));
  await withServer(t, {}, async (base) => {
    const response = await fetch(`${base}/api/appointments`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validReservation(), customerId: 1 }),
    });
    assert.equal(response.status, 400);
    assert.equal(customerCreate.mock.callCount(), 0);
    assert.equal(appointmentCreate.mock.callCount(), 0);
  });
});

test('reserva pública rechaza horarios fuera de agenda o en días sin horario', async (t) => {
  mockTransaction(t);
  t.mock.method(Barber, 'findAll', async () => [{ id: 1, active: true }]);
  t.mock.method(Service, 'findByPk', async () => ({ id: 1, active: true, name: 'Corte', price: '12000.00' }));
  t.mock.method(WorkingSchedule, 'findOne', async () => {
    const requestedHour = new Date(`${reservation.startAt.replace(' ', 'T')}Z`).getUTCHours();
    return { startTime: '00:00:00', endTime: `${String(requestedHour).padStart(2, '0')}:00:00` };
  });
  const customerCreate = t.mock.method(Customer, 'create', async () => ({ id: 1 }));
  const appointmentCreate = t.mock.method(Appointment, 'create', async () => ({ id: 1 }));
  const reservation = validReservation();
  await withServer(t, {}, async (base) => {
    const response = await fetch(`${base}/api/appointments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reservation),
    });
    assert.equal(response.status, 400);
    assert.equal(customerCreate.mock.callCount(), 0);
    assert.equal(appointmentCreate.mock.callCount(), 0);
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

  mockTransaction(t);
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

test('reserva pública rechaza un día que no tiene horario registrado', async (t) => {
  mockTransaction(t);
  t.mock.method(Barber, 'findAll', async () => [{ id: 1, active: true }]);
  t.mock.method(Service, 'findByPk', async () => ({ id: 1, active: true, name: 'Corte', price: '12000.00' }));
  t.mock.method(WorkingSchedule, 'findOne', async () => null);
  const createCustomer = t.mock.method(Customer, 'create', async () => ({ id: 1 }));
  await withServer(t, {}, async (base) => {
    const response = await fetch(`${base}/api/appointments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(validReservation()),
    });
    assert.equal(response.status, 400);
    assert.equal(createCustomer.mock.callCount(), 0);
  });
});

test('reprogramación administrativa también valida que la hora quepa en agenda', async (t) => {
  mockTransaction(t);
  mockAdmin(t);
  const start = new Date(Date.now() + 12 * 60 * 60 * 1000);
  start.setUTCMinutes(0, 0, 0);
  const appointment = {
    id: 1, customerId: 1, barberId: 1, serviceId: 1,
    startAt: new Date(start.getTime() - 60 * 60 * 1000), status: 'pending',
    async update(updates) { Object.assign(this, updates); return this; },
    async reload() { return this; },
  };
  t.mock.method(Appointment, 'findByPk', async () => appointment);
  t.mock.method(Barber, 'findAll', async (options) => {
    assert.equal(options.lock, 'UPDATE');
    return [{ id: 1, active: true }];
  });
  t.mock.method(WorkingSchedule, 'findOne', async () => ({
    startTime: '00:00:00',
    endTime: `${String(start.getUTCHours()).padStart(2, '0')}:00:00`,
  }));
  await withServer(t, { adminUserId: 1 }, async (base) => {
    const response = await fetch(`${base}/api/appointments/1`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startAt: `${start.toISOString().slice(0, 10)} ${start.toISOString().slice(11, 19)}` }),
    });
    assert.equal(response.status, 400);
  });
});

test('concurrent public bookings for one barber and slot create only one appointment', async (t) => {
  const lockTails = new Map();
  t.mock.method(sequelize, 'transaction', async (callback) => {
    const releases = [];
    const transaction = {
      LOCK: { UPDATE: 'UPDATE' },
      async acquire(key) {
        const previous = lockTails.get(key) || Promise.resolve();
        let release;
        const current = new Promise((resolve) => { release = resolve; });
        lockTails.set(key, current);
        await previous;
        releases.push(release);
      },
    };
    try {
      return await callback(transaction);
    } finally {
      releases.forEach((release) => release());
    }
  });

  t.mock.method(Barber, 'findAll', async (options) => {
    assert.equal(options.lock, 'UPDATE');
    await options.transaction.acquire('barber:1');
    return [{ id: 1, active: true }];
  });
  t.mock.method(Service, 'findByPk', async () => ({ id: 1, active: true, name: 'Corte', price: '12000.00' }));
  const reservation = validReservation();
  const startAt = new Date(`${reservation.startAt.replace(' ', 'T')}Z`);
  t.mock.method(WorkingSchedule, 'findOne', async () => scheduleFor(startAt));
  const booked = [];
  t.mock.method(Appointment, 'findOne', async ({ where }) => booked.find((item) =>
    item.barberId === where.barberId
      && item.startAt.getTime() === where.startAt.getTime()
      && item.status !== 'cancelled') || null);
  let customerId = 0;
  t.mock.method(Customer, 'create', async () => ({ id: ++customerId }));
  const createAppointment = t.mock.method(Appointment, 'create', async (values) => {
    const appointment = { id: booked.length + 1, ...values };
    booked.push(appointment);
    return appointment;
  });

  await withServer(t, {}, async (base) => {
    const sendBooking = () => fetch(`${base}/api/appointments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reservation),
    });
    const responses = await Promise.all([sendBooking(), sendBooking()]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
    assert.equal(createAppointment.mock.callCount(), 1);
    assert.equal(booked.length, 1);
    assert.equal(customerId, 1);
  });
});
