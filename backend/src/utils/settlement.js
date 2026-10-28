'use strict';

function cents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
function decimal(value) { return (value / 100).toFixed(2); }

function transitionError(appointment, next) {
  if (!next || next === appointment.status) return null;
  const allowed = { pending: ['confirmed', 'completed', 'cancelled', 'no_show'], confirmed: ['completed', 'cancelled', 'no_show'], completed: [], cancelled: [], no_show: [] };
  if (!(allowed[appointment.status] || []).includes(next)) return 'La transición de estado no está permitida.';
  if (appointment.paymentStatus === 'paid' && ['cancelled', 'no_show'].includes(next)) return 'Un turno cobrado no puede cancelarse ni marcarse ausente.';
  return null;
}

function protectedEditError(appointment, body) {
  if (Object.keys(body).some((key) => ['customerId', 'barberId', 'serviceId', 'startAt'].includes(key))
    && (appointment.paymentStatus === 'paid' || appointment.status === 'completed' || appointment.completedAt
      || appointment.mercadoPagoOrderId || appointment.mercadoPagoIdempotencyKey)) {
    return 'No se pueden cambiar cliente, barbero, servicio u horario de un turno cobrado, realizado o con checkout iniciado.';
  }
  return transitionError(appointment, body.status);
}

function completionFields(appointment, userId) {
  return appointment.status === 'completed' ? {} : { status: 'completed', completedAt: new Date(), completedByUserId: userId };
}

function orderMatches(appointment, order) {
  return typeof order?.id === 'string' && order.id.toLowerCase() === appointment.mercadoPagoOrderId?.toLowerCase()
    && order.external_reference === `barberia-appointment-${appointment.id}`;
}

async function recordProviderCharge(appointment, order, Charge, transaction) {
  const existing = await Charge.findOne({ where: { appointmentId: appointment.id }, transaction });
  if (existing) {
    if (existing.method !== 'mercado_pago' || existing.providerOrderId !== order.id) throw new Error('Conflicting charge');
    return existing;
  }
  const amount = cents(order.total_paid_amount);
  const expected = cents(appointment.servicePrice);
  if (order.currency !== 'ARS' || amount === null || expected === null || amount < expected || amount <= 0) {
    throw new Error('Invalid provider settlement');
  }
  const date = new Date(order.last_updated_date);
  const hasProviderDate = typeof order.last_updated_date === 'string' && Number.isFinite(date.getTime());
  return Charge.create({ appointmentId: appointment.id, amount: decimal(amount), expectedAmount: decimal(expected), currency: 'ARS',
    method: 'mercado_pago', providerOrderId: order.id, recordedByUserId: null,
    paidAt: hasProviderDate ? date : new Date(), dateSource: hasProviderDate ? 'provider_update' : 'verified_at',
  }, { transaction });
}

function publicAppointment(appointment) {
  const value = typeof appointment.toJSON === 'function' ? appointment.toJSON() : { ...appointment };
  value.checkoutStarted = Boolean(value.mercadoPagoOrderId || value.mercadoPagoIdempotencyKey);
  for (const key of ['mercadoPagoOrderId', 'mercadoPagoCheckoutUrl', 'mercadoPagoIdempotencyKey', 'paymentInitiationTokenHash']) delete value[key];
  return value;
}
module.exports = { cents, decimal, transitionError, protectedEditError, completionFields, orderMatches, recordProviderCharge, publicAppointment };
