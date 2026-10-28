import { useEffect, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { getAdminBarbers, getAppointments, updateAppointment } from '../services/api.js';
import { appointmentStatuses, statusLabels } from './adminUtils.js';
import { AppointmentCard } from './AppointmentActions.jsx';
import { agendaDateString } from './agendaTime.js';

export default function AppointmentsPage() {
  const [barbers, setBarbers] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [filters, setFilters] = useState(() => ({ date: agendaDateString(), barberId: '', status: '' }));
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] = useState(null);
  const [error, setError] = useState('');
  const applyUpdate = (updated) => setAppointments((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));

  useEffect(() => {
    let active = true;
    getAdminBarbers().then((items) => { if (active) setBarbers(items); }).catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const query = {
      ...(filters.date ? { agendaDate: filters.date } : {}),
      ...(filters.barberId ? { barberId: filters.barberId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };
    getAppointments(query).then((items) => { if (active) setAppointments(items); })
      .catch((requestError) => { if (active) setError(requestError.message || 'No pudimos cargar los turnos.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters]);

  async function changeStatus(appointment, status) {
    if (status === appointment.status) return;
    if (!window.confirm(`¿Cambiar el turno a ${statusLabels[status]}?`)) return;
    setChangingId(appointment.id);
    setError('');
    try {
      const updated = await updateAppointment(appointment.id, { status });
      setAppointments((current) => current.map((item) => item.id === appointment.id ? { ...item, ...updated } : item));
    } catch (requestError) {
      setError(requestError.message || 'No pudimos actualizar el estado del turno.');
    } finally { setChangingId(null); }
  }

  function statusControl(appointment) {
    if (!['pending', 'confirmed'].includes(appointment.status)) return null;
    return <div className="appointment-owner-actions" aria-label={`Otras acciones del turno ${appointment.id}`}>
      {appointmentStatuses.filter((status) => status === appointment.status || (appointment.status === 'pending' && status === 'confirmed')
        || (appointment.paymentStatus !== 'paid' && ['cancelled', 'no_show'].includes(status))).filter((status) => status !== appointment.status)
        .map((status) => <Button key={status} variant="outline-light" size="sm" disabled={changingId === appointment.id}
          onClick={() => changeStatus(appointment, status)}>{status === 'cancelled' ? 'Cancelar turno' : status === 'no_show' ? 'Marcar ausente' : 'Confirmar turno'}</Button>)}
    </div>;
  }

  return <>
    <div className="admin-filters mb-3">
      <Form.Group><Form.Label>Fecha</Form.Label><Form.Control type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} /></Form.Group>
      <Form.Group><Form.Label>Barbero</Form.Label><Form.Select value={filters.barberId} onChange={(event) => setFilters((current) => ({ ...current, barberId: event.target.value }))}><option value="">Todos</option>{barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}{!barber.active ? ' (inactivo)' : ''}</option>)}</Form.Select></Form.Group>
      <Form.Group><Form.Label>Estado</Form.Label><Form.Select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Todos</option>{appointmentStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</Form.Select></Form.Group>
      <div className="admin-filter-count">{loading ? 'Actualizando…' : `${appointments.length} turnos`}</div>
    </div>
    {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}
    <div>
      {loading ? <div className="admin-loading"><Spinner animation="border" role="status" /><span>Cargando turnos…</span></div> : appointments.length ? <>
        <div className="appointments-grid">{appointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} onUpdated={applyUpdate} statusControl={statusControl(appointment)} showDate />)}</div>
      </> : <p className="admin-empty mb-0">No hay turnos que coincidan con estos filtros.</p>}
    </div>
  </>;
}
