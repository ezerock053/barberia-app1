import { useEffect, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { getAppointments } from '../services/api.js';
import { agendaDateString } from './agendaTime.js';
import { AppointmentCard } from './AppointmentActions.jsx';

export default function MyAgendaPage() {
  const [date, setDate] = useState(agendaDateString);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const applyUpdate = (updated) => setAppointments((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));

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
    <div className="agenda-toolbar"><Form.Group controlId="agenda-date"><Form.Label>Fecha de tu agenda</Form.Label>
      <Form.Control type="date" value={date} onChange={(event) => setDate(event.target.value)} />
    </Form.Group><Button variant="outline-light" onClick={() => setDate(agendaDateString())}>Hoy</Button>
      <span>{loading ? 'Cargando…' : `${appointments.length} turnos`} · Buenos Aires</span></div>
    {error ? <Alert variant="warning">{error}</Alert> : loading ? <Spinner animation="border" role="status"><span className="visually-hidden">Cargando agenda</span></Spinner>
      : appointments.length ? <div className="appointments-grid">{appointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} onUpdated={applyUpdate} />)}</div>
        : <p className="admin-empty">No tenés turnos para esta fecha.</p>}
  </>;
}
