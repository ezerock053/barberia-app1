import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import { getDailyReport } from '../services/api.js';
import { formatPrice, paymentMethodLabels } from './adminUtils.js';
import { agendaDateString, formatAgendaDate } from './agendaTime.js';
import './reports.css';

const appointmentLink = (id) => `/admin/appointments?appointmentId=${id}`;
function Methods({ values }) {
  return <div className="report-methods">{Object.entries(values).map(([method, item]) => <div key={method}>
    <span>{paymentMethodLabels[method]} <small>· {item.count} cobros</small></span><strong>{formatPrice(item.amount)}</strong>
  </div>)}</div>;
}

export default function DashboardPage() {
  const [date, setDate] = useState(agendaDateString);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setData(null);
    getDailyReport(date).then((report) => { if (active) setData(report); })
      .catch((err) => { if (active) setError(err.message || 'No pudimos cargar el reporte.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date, refresh]);

  return <div className="financial-report">
    <div className="report-toolbar">
      <div><h2>El negocio, de un vistazo</h2><p>Ingresos y actividad · Buenos Aires</p></div>
      <div className="report-date-controls"><Form.Group controlId="report-date"><Form.Label>Fecha del reporte</Form.Label>
        <Form.Control type="date" value={date} max={agendaDateString()} required onChange={(event) => { if (event.target.value) setDate(event.target.value); }} />
      </Form.Group><Button variant="outline-light" onClick={() => setDate(agendaDateString())}>Hoy</Button>
      <Button variant="outline-light" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Actualizar</Button></div>
    </div>
    {loading && <div className="admin-loading" role="status"><Spinner animation="border" /><span>Cargando reporte…</span></div>}
    {error && <Alert variant="warning">{error} <Button variant="link" onClick={() => setRefresh((value) => value + 1)}>Reintentar</Button></Alert>}
    {data && <>
      <p className="report-note">Importes brutos cobrados, sin descontar comisiones de Mercado Pago ni pagos a barberos.</p>
      <Row className="g-3 mb-3">
        {[{ label: 'Total cobrado', value: formatPrice(data.totals.collected), detail: `${data.totals.collectedCount} cobros registrados`, tone: 'green' },
          { label: 'Servicios realizados', value: data.totals.completedCount, detail: `${formatPrice(data.totals.completedValue)} en servicios`, tone: 'gold' },
          { label: 'Realizados sin cobrar', value: formatPrice(data.totals.outstandingValue), detail: `${data.totals.outstandingCount} servicios de esta fecha, impagos hoy`, tone: 'yellow' }]
          .map((metric) => <Col xs={12} md={4} key={metric.label}><Card className={`admin-metric metric-${metric.tone} h-100`}><Card.Body>
            <div>{metric.label}</div><strong>{metric.value}</strong><small className="d-block">{metric.detail}</small>
          </Card.Body></Card></Col>)}
      </Row>
      <Card className="admin-card mb-4"><Card.Body><h3>Cobrado por método</h3><Methods values={data.totals.byMethod} /></Card.Body></Card>
      {!data.collections.length && !data.services.length && <p className="admin-empty">No hay cobros ni servicios realizados en esta fecha.</p>}
      <div className="report-section-title"><h3>Resumen por barbero</h3><span>Abrí un detalle para ver sus métodos de cobro</span></div>
      <div className="report-barbers mb-4">{data.barbers.map((barber) => <details className="report-barber" key={barber.id}>
        <summary><span><strong>{barber.name}</strong>{!barber.active && <Badge bg="secondary" className="ms-2">Inactivo</Badge>}
          <small>{barber.completedCount} realizados · {formatPrice(barber.completedValue)} en servicios</small></span>
          <span className="report-barber-total"><strong>{formatPrice(barber.collected)}</strong><small>Cobrado · Ver detalle</small></span></summary>
        <Methods values={barber.byMethod} /><p className="report-note">Sin cobrar hoy: {barber.outstandingCount} servicios de esta fecha ({formatPrice(barber.outstandingValue)}).</p>
        <a href="#report-collections">Ver detalle de cobros ↓</a>
      </details>)}</div>
      <Row className="g-3"><Col xs={12} lg={6}><Card className="admin-card h-100" id="report-collections"><Card.Body>
        <h3>Cobros de la fecha</h3><p className="report-note">Según la fecha efectiva registrada del cobro, aunque el corte se haya realizado otro día.</p>
        {data.collections.length ? <ul className="report-records">{data.collections.map((item) => <li key={item.id}>
          <div><a href={appointmentLink(item.appointmentId)}>{item.customerName} · Turno #{item.appointmentId}</a><small>{item.serviceName} · {item.barberName}</small>
            <small>{formatAgendaDate(item.paidAt)} · {paymentMethodLabels[item.method]}</small>
            {item.method === 'mercado_pago' && <small>Fecha: {item.dateSource === 'provider_update' ? 'actualización de la Order' : 'verificación del pago'}</small>}</div><strong>{formatPrice(item.amount)}</strong>
        </li>)}</ul> : <p className="admin-empty">Sin cobros registrados.</p>}
      </Card.Body></Card></Col><Col xs={12} lg={6}><Card className="admin-card h-100"><Card.Body>
        <h3>Servicios realizados</h3><p className="report-note">Según su finalización. El estado de cobro refleja la situación actual.</p>
        {data.services.length ? <ul className="report-records">{data.services.map((item) => <li key={item.id}>
          <div><a href={appointmentLink(item.id)}>{item.customerName} · Turno #{item.id}</a><small>{item.serviceName} · {item.barberName}</small>
            <small>{formatAgendaDate(item.completedAt)}</small><Badge bg={item.outstanding ? 'warning' : 'success'} text={item.outstanding ? 'dark' : undefined}>{item.outstanding ? 'Pendiente de cobro' : item.hasCharge ? 'Cobro registrado' : 'Pagado histórico'}</Badge></div>
          <strong>{formatPrice(item.expectedAmount)}</strong>
        </li>)}</ul> : <p className="admin-empty">Sin servicios realizados.</p>}
      </Card.Body></Card></Col></Row>
      {(data.historical.completedWithoutDate > 0 || data.historical.paidWithoutCharge > 0) && <Alert variant="secondary" className="mt-3">
        Históricos de toda la base: {data.historical.completedWithoutDate} realizados sin fecha de finalización y {data.historical.paidWithoutCharge} pagados sin registro de cobro.
        Sin fecha de finalización no suman actividad diaria; sin registro de cobro no suman ingresos. No se estiman importes a partir de reservas.
      </Alert>}
      {data.warnings.providerDateCount > 0 && <p className="report-note mt-3">Mercado Pago: se utiliza la fecha de actualización de la Order o, si falta, la de verificación. No representa necesariamente la fecha de acreditación.</p>}
      {data.warnings.inconsistentPaymentStates > 0 && <Alert variant="warning" className="mt-3">Hay {data.warnings.inconsistentPaymentStates} servicios con un cobro registrado y un estado de pago desactualizado. No se consideran pendientes ni se duplican ingresos.</Alert>}
      <p className="report-note mt-3">Actualizado: {formatAgendaDate(data.generatedAt)} · Moneda: ARS. Actualizá para ver operaciones nuevas.</p>
    </>}
  </div>;
}
