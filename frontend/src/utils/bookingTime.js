import { agendaDateString, AGENDA_TIME_ZONE } from '../admin/agendaTime.js';

export function bookingDateLimits(now = new Date()) {
  return { today: agendaDateString(now), maxDate: agendaDateString(new Date(now.getTime() + 30 * 86400000)) };
}

export function formatBookingDate(date) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: AGENDA_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`));
}

// The server supplies the UTC instant for each Buenos Aires wall-clock option.
// Never interpret it in the browser's timezone or rebuild it as a bare datetime.
export function bookingStartAt(date, slot, slotStartsAt) {
  const instant = slotStartsAt[slot];
  if (typeof instant !== 'string' || !/Z$/.test(instant) || !Number.isFinite(Date.parse(instant))) {
    throw new Error('Volvé a consultar los horarios disponibles antes de reservar.');
  }
  const parsed = new Date(instant);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: AGENDA_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(parsed);
  if (agendaDateString(parsed) !== date || time !== slot) {
    throw new Error('El horario cambió. Volvé a consultar la disponibilidad.');
  }
  return instant;
}
