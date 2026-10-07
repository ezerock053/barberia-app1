import { useEffect, useState } from 'react';
import { Alert, Badge, Form, Spinner, Table } from 'react-bootstrap';
import { getAdminBarbers, getAppointments, updateAppointment } from '../services/api.js';
import { appointmentStatuses, formatAppointmentDate, formatPrice, statusLabels, statusVariants } from './adminUtils.js';

export default function AppointmentsPage() {
  const [barbers, setBarbers] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [filters, setFilters] = useState({ date: '', barberId: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] = useState(null);
  const [error, setError] = useState('');

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
      ...(filters.date ? { from: filters.date, to: filters.date } : {}),
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
    setChangingId(appointment.id);
    setError('');
    try {
      const updated = await updateAppointment(appointment.id, { status });
      setAppointments((current) => current.map((item) => item.id === appointment.id ? { ...item, ...updated } : item));
    } catch (requestError) {
      setError(requestError.message || 'No pudimos actualizar el estado del turno.');
    } finally { setChangingId(null); }
  }

  return <>
    <div className="admin-filters mb-3">
      <Form.Group><Form.Label>Fecha</Form.Label><Form.Control type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} /></Form.Group>
      <Form.Group><Form.Label>Barbero</Form.Label><Form.Select value={filters.barberId} onChange={(event) => setFilters((current) => ({ ...current, barberId: event.target.value }))}><option value="">Todos</option>{barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}{!barber.active ? ' (inactivo)' : ''}</option>)}</Form.Select></Form.Group>
      <Form.Group><Form.Label>Estado</Form.Label><Form.Select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">Todos</option>{appointmentStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</Form.Select></Form.Group>
      <div className="admin-filter-count">{loading ? 'Actualizando…' : `${appointments.length} turnos`}</div>
    </div>
    {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}
    <div className="admin-card table-responsive">
      {loading ? <div className="admin-loading"><Spinner animation="border" role="status" /><span>Cargando turnos…</span></div> : appointments.length ? <Table className="admin-table align-middle mb-0">
        <thead><tr><th>Cliente</th><th>Servicio</th><th>Barbero</th><th>Fecha y hora</th><th>Precio</th><th>Estado</th></tr></thead>
        <tbody>{appointments.map((appointment) => <tr key={appointment.id}>
          <td><strong>{appointment.customer?.name || '—'}</strong><small>{appointment.customer?.phone || 'Sin teléfono'}</small><small>{appointment.customer?.email || ''}</small></td>
          <td><strong>{appointment.serviceName || appointment.service?.name || '—'}</strong></td>
          <td>{appointment.barber?.name || '—'}</td>
          <td>{formatAppointmentDate(appointment.startAt)}</td>
          <td>{formatPrice(appointment.servicePrice)}</td>
          <td><div className="d-flex flex-column gap-2"><Badge bg={statusVariants[appointment.status] || 'secondary'} className="align-self-start">{statusLabels[appointment.status] || appointment.status}</Badge><Form.Select aria-label={`Cambiar estado del turno ${appointment.id}`} size="sm" value={appointment.status} disabled={changingId === appointment.id} onChange={(event) => changeStatus(appointment, event.target.value)}>{appointmentStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</Form.Select></div></td>
        </tr>)}</tbody>
      </Table> : <p className="admin-empty mb-0">No hay turnos que coincidan con estos filtros.</p>}
    </div>
  </>;
}
