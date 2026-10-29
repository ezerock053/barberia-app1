'use strict';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', era: 'short',
});
function businessDate(value = new Date()) {
  const parts = formatter.formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type).value;
  const year = part('era') === 'BC' ? '0000' : part('year').padStart(4, '0');
  return `${year}-${part('month')}-${part('day')}`;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function dayStart(date) {
  const midnight = new Date(`${date}T00:00:00Z`).getTime();
  // Find the first instant of the local calendar date. Also handles Argentina's
  // historical offset changes and days whose local midnight did not exist.
  let low = midnight - 36 * 3600000;
  let high = midnight + 36 * 3600000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (businessDate(new Date(middle)) < date) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}
function businessDayRange(date) {
  if (!validDate(date)) throw new Error('Invalid calendar date');
  const next = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  return { start: dayStart(date), end: dayStart(next) };
}
module.exports = { TIME_ZONE, businessDate, validDate, businessDayRange };
