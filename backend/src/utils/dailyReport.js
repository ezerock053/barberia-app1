'use strict';
const { cents } = require('./settlement');
const { TIME_ZONE } = require('./businessDay');

const METHODS = ['cash', 'transfer', 'mercado_pago'];
function minor(value) {
  const result = cents(value);
  if (result === null) throw new Error('Invalid monetary data in report');
  return BigInt(result);
}
function money(value) { return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`; }
function empty() {
  return { collectedCount: 0, collected: 0n, completedCount: 0, completedValue: 0n, outstandingCount: 0, outstandingValue: 0n,
    byMethod: Object.fromEntries(METHODS.map((method) => [method, { count: 0, amount: 0n }])) };
}
function serialize(value) {
  return { collectedCount: value.collectedCount, collected: money(value.collected), completedCount: value.completedCount,
    completedValue: money(value.completedValue), outstandingCount: value.outstandingCount, outstandingValue: money(value.outstandingValue),
    byMethod: Object.fromEntries(METHODS.map((method) => [method, { count: value.byMethod[method].count, amount: money(value.byMethod[method].amount) }])) };
}
const plain = (value) => typeof value.toJSON === 'function' ? value.toJSON() : value;

function buildDailyReport({ date, charges, completed, barbers, historical = {}, generatedAt = new Date() }) {
  const totals = empty();
  const groups = new Map();
  for (const item of barbers.map(plain)) {
    if (item.active) groups.set(item.id, { id: item.id, name: item.name, active: item.active, ...empty() });
  }
  function group(appointment) {
    if (!groups.has(appointment.barberId)) groups.set(appointment.barberId, {
      id: appointment.barberId, name: appointment.barber?.name || 'Barbero histórico', active: appointment.barber?.active ?? false, ...empty(),
    });
    return groups.get(appointment.barberId);
  }
  const chargeIds = new Set(); const chargedAppointments = new Set(); const completedIds = new Set();
  const collections = []; const services = [];
  let providerDateCount = 0; let inconsistentPaymentStates = 0;
  for (const charge of charges.map(plain)) {
    if (chargeIds.has(charge.id)) continue;
    if (!METHODS.includes(charge.method) || charge.currency !== 'ARS' || !charge.appointment
      || chargedAppointments.has(charge.appointmentId)) throw new Error('Inconsistent charge data');
    chargeIds.add(charge.id); chargedAppointments.add(charge.appointmentId);
    const amount = minor(charge.amount);
    if (amount <= 0n) throw new Error('Invalid collected amount');
    const appointment = charge.appointment;
    const barber = group(appointment);
    for (const target of [totals, barber]) {
      target.collectedCount++; target.collected += amount;
      target.byMethod[charge.method].count++; target.byMethod[charge.method].amount += amount;
    }
    if (charge.method === 'mercado_pago' && charge.dateSource !== 'operator') providerDateCount++;
    collections.push({ id: charge.id, appointmentId: charge.appointmentId, amount: money(amount), method: charge.method,
      paidAt: charge.paidAt, dateSource: charge.dateSource, barberId: appointment.barberId, barberName: barber.name,
      customerName: appointment.customer?.name || 'Cliente histórico', serviceName: appointment.serviceName,
      appointmentStatus: appointment.status, completedAt: appointment.completedAt });
  }
  for (const appointment of completed.map(plain)) {
    if (completedIds.has(appointment.id)) continue;
    completedIds.add(appointment.id);
    const barber = group(appointment);
    const value = minor(appointment.servicePrice);
    const outstanding = appointment.paymentStatus !== 'paid' && !appointment.charge;
    if (appointment.charge && appointment.paymentStatus !== 'paid') inconsistentPaymentStates++;
    for (const target of [totals, barber]) {
      target.completedCount++; target.completedValue += value;
      if (outstanding) { target.outstandingCount++; target.outstandingValue += value; }
    }
    services.push({ id: appointment.id, barberId: appointment.barberId, barberName: barber.name,
      customerName: appointment.customer?.name || 'Cliente histórico', serviceName: appointment.serviceName,
      completedAt: appointment.completedAt, expectedAmount: money(value), outstanding,
      paymentStatus: appointment.paymentStatus, hasCharge: Boolean(appointment.charge) });
  }
  return { date, timeZone: TIME_ZONE, currency: 'ARS', gross: true, generatedAt,
    totals: serialize(totals), barbers: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map((barber) => ({ id: barber.id, name: barber.name, active: barber.active, ...serialize(barber) })),
    collections, services, historical: { completedWithoutDate: Number(historical.completedWithoutDate || 0), paidWithoutCharge: Number(historical.paidWithoutCharge || 0) },
    warnings: { providerDateCount, inconsistentPaymentStates },
  };
}
module.exports = { buildDailyReport };
