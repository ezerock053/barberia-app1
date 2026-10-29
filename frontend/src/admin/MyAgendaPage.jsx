import { useEffect, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { getAppointments } from '../services/api.js';
import { agendaDateString } from './agendaTime.js';
import { AppointmentCard } from './AppointmentActions.jsx';
import { useLatestQuery } from '../utils/useLatestQuery.js';
import { nextAppointmentId } from './nextAppointment.js';

export default function MyAgendaPage() {
  const [date, setDate] = useState(agendaDateString);
  const { data: appointments, setData: setAppointments, loading, error, refresh } = useLatestQuery(date || null, () => getAppointments({ agendaDate: date }));
  const [, setClockTick] = useState(0);
  const applyUpdate = (updated) => setAppointments((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const nextId = nextAppointmentId(appointments, date);

  return <>
    <div className="agenda-toolbar"><Form.Group controlId="agenda-date"><Form.Label>Fecha de tu agenda</Form.Label>
      <Form.Control type="date" value={date} onChange={(event) => setDate(event.target.value)} />
    </Form.Group><Button variant="outline-light" onClick={() => setDate(agendaDateString())}>Hoy</Button>
      <Button variant="outline-light" disabled={loading || !date} onClick={refresh}>Actualizar</Button>
      <span>{loading ? 'Cargando…' : `${appointments.length} turnos`} · Buenos Aires</span></div>
    {error ? <Alert variant="warning">{error} <Button variant="outline-dark" className="ux-retry" onClick={refresh}>Reintentar</Button></Alert> : loading ? <Spinner animation="border" role="status"><span className="visually-hidden">Cargando agenda</span></Spinner>
      : appointments.length ? <div className="appointments-grid">{appointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} onUpdated={applyUpdate} isNext={appointment.id === nextId} />)}</div>
        : <p className="admin-empty">No tenés turnos para esta fecha.</p>}
  </>;
}
