import { useEffect, useState } from 'react';
import { Alert, Badge, Form, Spinner, Table } from 'react-bootstrap';
import { getAppointments } from '../services/api.js';
import { formatPrice, statusLabels, statusVariants } from './adminUtils.js';
import { agendaDateString, formatAgendaDate } from './agendaTime.js';

export default function MyAgendaPage() {
  const [date, setDate] = useState(agendaDateString);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!date) { setAppointments([]); setLoading(false); return undefined; }
    setLoading(true);
    setError('');
    getAppointments({ agendaDate: date }).then((items) => { if (active) setAppointments(items); })
      .catch((requestError) => { if (active) setError(requestError.message || 'No pudimos cargar tu agenda.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date]);

  return <>
    <Form.Group className="mb-3" controlId="agenda-date"><Form.Label>Fecha de tu agenda</Form.Label>
      <Form.Control type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <Form.Text>Horario de Buenos Aires. Esta agenda es de solo lectura.</Form.Text>
    </Form.Group>
    {error ? <Alert variant="warning">{error}</Alert> : loading ? <Spinner animation="border" role="status"><span className="visually-hidden">Cargando agenda</span></Spinner>
      : appointments.length ? <div className="admin-card table-responsive"><Table className="admin-table align-middle mb-0">
        <thead><tr><th>Fecha y hora</th><th>Cliente</th><th>Servicio</th><th>Precio</th><th>Estado</th></tr></thead>
        <tbody>{appointments.map((appointment) => <tr key={appointment.id}>
          <td>{formatAgendaDate(appointment.startAt)}</td>
          <td><strong>{appointment.customer?.name || '—'}</strong><small>{appointment.customer?.phone || ''}</small></td>
          <td>{appointment.serviceName}</td><td>{formatPrice(appointment.servicePrice)}</td>
          <td><Badge bg={statusVariants[appointment.status] || 'secondary'}>{statusLabels[appointment.status] || appointment.status}</Badge></td>
        </tr>)}</tbody>
      </Table></div> : <p className="admin-empty">No tenés turnos para esta fecha.</p>}
  </>;
}
