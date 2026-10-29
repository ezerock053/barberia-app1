import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLatestQuery } from '../src/utils/latestQuery.js';
import { nextAppointmentId } from '../src/admin/nextAppointment.js';

const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('una respuesta atrasada no reemplaza la consulta nueva', async () => {
  const first = deferred(); const second = deferred(); const results = [];
  const cancel = loadLatestQuery(() => first.promise, (result) => results.push(result));
  cancel();
  loadLatestQuery(() => second.promise, (result) => results.push(result));
  second.resolve(['Barbero B']); await settle();
  first.resolve(['Barbero A']); await settle();
  assert.deepEqual(results, [{ data: ['Barbero B'], loading: false, error: '' }]);
});
test('un error atrasado tampoco borra los datos de una consulta exitosa', async () => {
  const old = deferred(); const results = [];
  const cancel = loadLatestQuery(() => old.promise, (result) => results.push(result));
  await settle(); cancel();
  loadLatestQuery(() => Promise.resolve(['Actual']), (result) => results.push(result));
  await settle(); old.reject(new Error('Anterior')); await settle();
  assert.deepEqual(results, [{ data: ['Actual'], loading: false, error: '' }]);
});
test('consulta fallida limpia datos y permite un reintento exitoso', async () => {
  const results = [];
  loadLatestQuery(() => { throw new Error('Sin conexión'); }, (result) => results.push(result));
  await settle();
  assert.deepEqual(results[0], { data: [], loading: false, error: 'Sin conexión' });
  loadLatestQuery(() => Promise.resolve([]), (result) => results.push(result)); await settle();
  assert.deepEqual(results[1], { data: [], loading: false, error: '' });
});
test('desmontar una vista descarta resultados y errores posteriores', async () => {
  for (const fail of [false, true]) {
    const pending = deferred(); let calls = 0;
    const cancel = loadLatestQuery(() => pending.promise, () => calls++);
    await settle(); cancel();
    if (fail) pending.reject(new Error('Tardío')); else pending.resolve([1]);
    await settle(); assert.equal(calls, 0);
  }
});

const now = new Date('2026-10-29T12:00:00Z'); // 09:00 Argentina
const row = (id, time, status = 'pending') => ({ id, status, startAt: `2026-10-29T${time}:00Z` });
test('próximo turno es el pendiente o confirmado futuro más cercano, sin depender del orden de las tarjetas', () => {
  const rows = [row(1, '16:00'), row(2, '13:00', 'confirmed'), row(3, '12:30', 'completed'), row(4, '12:15', 'cancelled'), row(5, '12:10', 'no_show'), row(6, '11:00')];
  assert.equal(nextAppointmentId(rows, '2026-10-29', now), 2);
  rows[1].status = 'completed';
  assert.equal(nextAppointmentId(rows, '2026-10-29', now), 1);
});
test('no destaca turnos de otra fecha, inválidos o pasados, y admite el instante exacto actual', () => {
  assert.equal(nextAppointmentId([row(1, '12:00')], '2026-10-29', now), 1);
  assert.equal(nextAppointmentId([row(1, '12:00')], '2026-10-28', now), null);
  assert.equal(nextAppointmentId([{ id: 1, status: 'pending', startAt: 'invalid' }, row(2, '11:59')], '2026-10-29', now), null);
  assert.equal(nextAppointmentId([], '2026-10-29', now), null);
});
test('hoy usa el día argentino aunque UTC ya haya cambiado de fecha', () => {
  const night = new Date('2026-10-30T01:00:00Z'); // 22:00 del 29
  const rows = [{ id: 1, status: 'confirmed', startAt: '2026-10-30T02:00:00Z' }, { id: 2, status: 'pending', startAt: '2026-10-30T03:00:00Z' }];
  assert.equal(nextAppointmentId(rows, '2026-10-29', night), 1);
  assert.equal(nextAppointmentId(rows, '2026-10-30', night), null);
});
