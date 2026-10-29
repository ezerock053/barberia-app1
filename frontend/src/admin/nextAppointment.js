import { agendaDateString } from './agendaTime.js';

export function nextAppointmentId(appointments, selectedDate, now = new Date()) {
  if (selectedDate !== agendaDateString(now)) return null;
  const candidates = appointments.filter((appointment) => {
    const start = new Date(appointment.startAt);
    return ['pending', 'confirmed'].includes(appointment.status) && Number.isFinite(start.getTime())
      && start.getTime() >= now.getTime() && agendaDateString(start) === selectedDate;
  });
  candidates.sort((left, right) => new Date(left.startAt) - new Date(right.startAt) || left.id - right.id);
  return candidates[0]?.id ?? null;
}
