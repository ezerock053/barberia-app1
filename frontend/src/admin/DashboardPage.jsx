import { useEffect, useState } from 'react';
import { Alert, Badge, Card, Col, Row, Spinner, Table } from 'react-bootstrap';
import { getAdminBarbers, getAdminServices, getAppointments } from '../services/api.js';
import { formatAppointmentDate, formatPrice, localDateString, paymentMethodLabels, paymentStatusLabels, statusLabels, statusVariants } from './adminUtils.js';

const emptyData = { today: [], pending: [], confirmed: [], services: [], barbers: [], upcoming: [] };

export default function DashboardPage() {
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const today = localDateString();
    Promise.all([
      getAppointments({ from: today, to: today }),
      getAppointments({ status: 'pending' }),
      getAppointments({ status: 'confirmed' }),
      getAdminServices(),
      getAdminBarbers(),
      getAppointments({ from: today }),
    ]).then(([todayAppointments, pending, confirmed, services, barbers, future]) => {
      if (!active) return;
      const now = Date.now();
      const upcoming = future
        .filter((appointment) => new Date(appointment.startAt).getTime() >= now
          && ['pending', 'confirmed'].includes(appointment.status))
        .slice(0, 6);
      setData({ today: todayAppointments, pending, confirmed, services, barbers, upcoming });
    }).catch((requestError) => {
      if (active) setError(requestError.message || 'No pudimos cargar el resumen.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="admin-loading"><Spinner animation="border" role="status" /><span>Cargando resumen…</span></div>;
  if (error) return <Alert variant="warning">{error}</Alert>;

  const metrics = [
    { label: 'Turnos de hoy', value: data.today.length, tone: 'gold' },
    { label: 'Pendientes', value: data.pending.length, tone: 'yellow' },
    { label: 'Confirmados', value: data.confirmed.length, tone: 'green' },
    { label: 'Servicios activos', value: data.services.filter((item) => item.active).length, tone: 'gold' },
    { label: 'Barberos activos', value: data.barbers.filter((item) => item.active).length, tone: 'gold' },
  ];

  return <>
    <Row className="g-3 mb-4">
      {metrics.map((metric) => <Col xs={6} xl key={metric.label}>
        <Card className={`admin-metric metric-${metric.tone} h-100`}><Card.Body><div>{metric.label}</div><strong>{metric.value}</strong></Card.Body></Card>
      </Col>)}
    </Row>
    <Card className="admin-card">
      <Card.Header><div><strong>Próximos turnos</strong><span>Agenda próxima</span></div><a href="/admin/appointments">Ver todos</a></Card.Header>
      <Card.Body className="p-0">
        {data.upcoming.length ? <div className="table-responsive"><Table className="admin-table align-middle mb-0">
          <thead><tr><th>Fecha y hora</th><th>Cliente</th><th>Servicio</th><th>Barbero</th><th>Precio</th><th>Pago</th><th>Estado</th></tr></thead>
          <tbody>{data.upcoming.map((appointment) => <tr key={appointment.id}>
            <td>{formatAppointmentDate(appointment.startAt)}</td>
            <td><strong>{appointment.customer?.name || '—'}</strong><small>{appointment.customer?.phone || ''}</small></td>
            <td>{appointment.serviceName || appointment.service?.name || '—'}</td>
            <td>{appointment.barber?.name || '—'}</td>
            <td>{formatPrice(appointment.servicePrice)}</td>
            <td><strong>{paymentMethodLabels[appointment.paymentMethod] || 'No especificado'}</strong><small>{paymentStatusLabels[appointment.paymentStatus] || 'Pendiente'}</small></td>
            <td><Badge bg={statusVariants[appointment.status] || 'secondary'}>{statusLabels[appointment.status] || appointment.status}</Badge></td>
          </tr>)}</tbody>
        </Table></div> : <p className="admin-empty mb-0">No hay próximos turnos agendados.</p>}
      </Card.Body>
    </Card>
  </>;
}
