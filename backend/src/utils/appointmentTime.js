'use strict';

const { TIME_ZONE, businessDate, validDate } = require('./businessDay');
const clock = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function businessTime(instant) {
  const date = businessDate(instant);
  const parts = clock.formatToParts(instant);
  const part = (type) => Number(parts.find((item) => item.type === type).value);
  return { date, dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay(),
    hour: part('hour'), minute: part('minute'), second: part('second') };
}

// New callers send an explicit offset or Z. Bare values retain the legacy UTC
// interpretation; they must never be retroactively reinterpreted as local time.
function parseAppointmentTime(value, exactHour = false) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) return null;
  const [, date, hour, minute, second, fraction, zone] = match;
  if (!validDate(date) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (zone && zone !== 'Z') {
    const hours = Number(zone.slice(1, 3)); const minutes = Number(zone.slice(4, 6));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
  }
  const instant = new Date(`${date}T${hour}:${minute}:${second}${fraction ? `.${fraction}` : ''}${zone || 'Z'}`);
  if (!Number.isFinite(instant.getTime())) return null;
  if (exactHour) {
    const local = businessTime(instant);
    if (local.minute !== 0 || local.second !== 0 || instant.getUTCMilliseconds() !== 0) return null;
  }
  return instant;
}

// Convert a business wall clock to an instant using IANA rules, not the server TZ.
// Return null for a historical local time that did not exist during a DST jump.
function slotInstant(date, time) {
  if (!validDate(date) || typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const target = Date.parse(`${date}T${time}:00Z`);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const local = businessTime(new Date(guess));
    const displayed = Date.parse(`${local.date}T${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}:${String(local.second).padStart(2, '0')}Z`);
    if (displayed === target) return new Date(guess);
    guess += target - displayed;
  }
  return null;
}

module.exports = { businessTime, parseAppointmentTime, slotInstant };
