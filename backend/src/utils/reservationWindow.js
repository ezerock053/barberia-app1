'use strict';

const MIN_ADVANCE_MS = 2 * 60 * 60 * 1000;
const MAX_ADVANCE_MS = 30 * 24 * 60 * 60 * 1000;

function isWithinReservationWindow(startAt, now = new Date()) {
  const advance = startAt.getTime() - now.getTime();
  return advance >= MIN_ADVANCE_MS && advance <= MAX_ADVANCE_MS;
}

function getReservationWindowError(startAt, now = new Date()) {
  const advance = startAt.getTime() - now.getTime();
  if (advance < MIN_ADVANCE_MS) return 'startAt must be at least 2 hours in the future';
  if (advance > MAX_ADVANCE_MS) return 'startAt cannot be more than 30 days in the future';
  return null;
}

module.exports = { getReservationWindowError, isWithinReservationWindow };
