'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createAuthRouter = require('../src/routes/auth');
const { createRequireAdmin } = require('../src/middleware/requireAdmin');

function createHarness({ admin = { id: 7, email: 'admin@example.com', passwordHash: 'bcrypt-hash', active: true }, loggedIn = false } = {}) {
  const state = { adminUserId: loggedIn ? admin.id : undefined, regenerated: false, destroyed: false, invalidatedSessions: false };
  const model = {
    unscoped: () => ({ findOne: async ({ where }) => where.active && (where.email === admin.email || where.id === admin.id) ? admin : null }),
    findOne: async ({ where }) => where.active && where.id === admin.id ? { id: admin.id, email: admin.email } : null,
  };
  const hasher = {
    compare: async (candidate, hash) => (candidate === 'correct-password' && hash === 'bcrypt-hash') || hash === `bcrypt-hash:${candidate}`,
    hash: async (candidate, rounds) => { assert.equal(rounds, 12); return `bcrypt-hash:${candidate}`; },
  };
  admin.save = async () => admin;
  const sequelizeInstance = { transaction: async (callback) => callback({ transaction: true }) };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = {
      get adminUserId() { return state.adminUserId; },
      set adminUserId(value) { state.adminUserId = value; },
      regenerate(callback) { state.regenerated = true; state.adminUserId = undefined; callback(null); },
      save(callback) { callback(null); },
      destroy(callback) { state.destroyed = true; state.adminUserId = undefined; callback(null); },
    };
    next();
  });
  app.use('/api/auth', createAuthRouter({
    adminUserModel: model,
    passwordHasher: hasher,
    requireAdmin: createRequireAdmin(model),
    invalidateSessions: async (transaction) => {
      assert.deepEqual(transaction, { transaction: true });
      state.invalidatedSessions = true;
    },
    sequelizeInstance,
  }));
  return { app, state };
}

async function withServer(t, app, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  return run(`http://127.0.0.1:${server.address().port}/api/auth`);
}

test('login exitoso regenera la sesión y /me devuelve solo datos públicos; logout la destruye', async (t) => {
  const { app, state } = createHarness();
  await withServer(t, app, async (baseUrl) => {
    const login = await fetch(`${baseUrl}/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ADMIN@example.com', password: 'correct-password' }),
    });
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), { admin: { id: 7, email: 'admin@example.com' } });
    assert.equal(state.regenerated, true);
    assert.equal(state.adminUserId, 7);

    const me = await fetch(`${baseUrl}/me`);
    assert.equal(me.status, 200);
    const meBody = await me.json();
    assert.deepEqual(meBody, { admin: { id: 7, email: 'admin@example.com' } });
    assert.equal(JSON.stringify(meBody).includes('passwordHash'), false);

    const logout = await fetch(`${baseUrl}/logout`, { method: 'POST' });
    assert.equal(logout.status, 204);
    assert.equal(state.destroyed, true);
    assert.match(logout.headers.get('set-cookie'), /connect\.sid=;/);
  });
});

test('credenciales incorrectas reciben la misma respuesta genérica', async (t) => {
  const { app } = createHarness();
  await withServer(t, app, async (baseUrl) => {
    const wrongPassword = await fetch(`${baseUrl}/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'wrong-password' }),
    });
    const unknownEmail = await fetch(`${baseUrl}/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'missing@example.com', password: 'correct-password' }),
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(await wrongPassword.json(), await unknownEmail.json());
  });
});

test('/me responde 401 sin autenticaciÃ³n', async (t) => {
  const { app } = createHarness();
  await withServer(t, app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/me`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'No autenticado' });
  });
});

test('cambiar contraseña exige una sesión administrativa', async (t) => {
  const { app } = createHarness();
  await withServer(t, app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/change-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'correct-password', newPassword: 'new-password-123', confirmPassword: 'new-password-123' }),
    });
    assert.equal(response.status, 401);
  });
});

test('cambio válido guarda hash nuevo e invalida sesiones y cookie actual', async (t) => {
  const { app, state } = createHarness({ loggedIn: true });
  await withServer(t, app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/change-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'correct-password', newPassword: 'brand-new-password-123', confirmPassword: 'brand-new-password-123' }),
    });
    assert.equal(response.status, 204);
    assert.equal(state.invalidatedSessions, true);
    assert.equal(state.destroyed, true);
    assert.equal(state.adminUserId, undefined);
    assert.match(response.headers.get('set-cookie'), /connect\.sid=;/);
  });
});

test('cambio de contraseña rechaza contraseña actual incorrecta', async (t) => {
  const { app, state } = createHarness({ loggedIn: true });
  await withServer(t, app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/change-password`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'incorrecta', newPassword: 'brand-new-password-123', confirmPassword: 'brand-new-password-123' }),
    });
    assert.equal(response.status, 400);
    assert.equal(state.invalidatedSessions, false);
  });
});

test('cambio de contraseña valida longitud, límite bcrypt, confirmación y diferencia', async (t) => {
  const cases = [
    ['short', 'short', 'al menos 12'],
    ['ñ'.repeat(37), 'ñ'.repeat(37), 'máximo'],
    ['brand-new-password-123', 'brand-new-password-456', 'confirmación'],
    ['correct-password', 'correct-password', 'distinta'],
  ];
  for (const [newPassword, confirmPassword, expectedMessage] of cases) {
    const { app, state } = createHarness({ loggedIn: true });
    await withServer(t, app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/change-password`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'correct-password', newPassword, confirmPassword }),
      });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, new RegExp(expectedMessage));
      assert.equal(state.invalidatedSessions, false);
    });
  }
});
