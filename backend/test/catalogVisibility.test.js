'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SESSION_SECRET ||= 'test-secret-that-is-at-least-32-characters-long';
const app = require('../src/app');
const { Barber, Service } = require('../src/models');

async function withServer(t) {
  const server = app.listen(0);
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  await new Promise((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

for (const [label, Model, endpoint] of [
  ['services', Service, '/api/services'],
  ['barbers', Barber, '/api/barbers'],
]) {
  test(`GET ${endpoint} returns only active ${label} by default and for other parameter values`, async (t) => {
    const activeRecords = [{ id: 1, active: true }];
    const findAll = t.mock.method(Model, 'findAll', async (options) => {
      assert.deepEqual(options.where, { active: true });
      return activeRecords;
    });
    const base = await withServer(t);

    for (const query of ['', '?includeInactive=false', '?includeInactive=TRUE', '?includeInactive=1']) {
      const response = await fetch(`${base}${endpoint}${query}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), activeRecords);
    }

    assert.equal(findAll.mock.callCount(), 4);
  });

  test(`GET ${endpoint}?includeInactive=true requires an admin session`, async (t) => {
    const base = await withServer(t);
    const response = await fetch(`${base}${endpoint}?includeInactive=true`);

    assert.equal(response.status, 401);
  });
}
