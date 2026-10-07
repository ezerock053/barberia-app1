export const appointmentStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];

export const statusLabels = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  completed: 'Completado',
  cancelled: 'Cancelado',
  no_show: 'No asistió',
};

export const statusVariants = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'primary',
  cancelled: 'secondary',
  no_show: 'danger',
};

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatAppointmentDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function formatPrice(value) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
