'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getReservationWindowError, isWithinReservationWindow } = require('../src/utils/reservationWindow');

test('reservation window includes the exact two-hour and thirty-day boundaries', () => {
  const now = new Date('2026-10-02T18:30:00.000Z');
  const twoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  assert.equal(isWithinReservationWindow(twoHours, now), true);
  assert.equal(getReservationWindowError(twoHours, now), null);
  assert.equal(isWithinReservationWindow(thirtyDays, now), true);
  assert.equal(getReservationWindowError(thirtyDays, now), null);
});

test('reservation window rejects times before two hours and after thirty days', () => {
  const now = new Date('2026-10-02T18:30:00.000Z');
  const tooSoon = new Date(now.getTime() + 2 * 60 * 60 * 1000 - 1);
  const tooFar = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000 + 1);

  assert.equal(isWithinReservationWindow(tooSoon, now), false);
  assert.match(getReservationWindowError(tooSoon, now), /at least 2 hours/);
  assert.equal(isWithinReservationWindow(tooFar, now), false);
  assert.match(getReservationWindowError(tooFar, now), /more than 30 days/);
});
