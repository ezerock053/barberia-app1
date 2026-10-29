export const AGENDA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function agendaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: AGENDA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function formatAgendaDate(value) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: AGENDA_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
}

export function formatAgendaTime(value) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: AGENDA_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
}
