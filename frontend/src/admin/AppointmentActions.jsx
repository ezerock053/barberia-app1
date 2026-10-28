import { useRef, useState } from 'react';
import { Alert, Badge, Button, Card } from 'react-bootstrap';
import { collectAppointment, completeAppointment, completeAndCollectAppointment, getAppointment, refreshAppointmentPayment } from '../services/api.js';
import { formatPrice, paymentMethodLabels, statusLabels, statusVariants } from './adminUtils.js';
import { formatAgendaDate, AGENDA_TIME_ZONE } from './agendaTime.js';
import { appointmentWorkflow } from './appointmentWorkflow.js';
import './agenda.css';

export function AppointmentPayment({ appointment }) {
  const { paid, checkoutPending } = appointmentWorkflow(appointment);
  return <span className="appointment-payment-state"><Badge bg={paid ? 'success' : checkoutPending ? 'secondary' : 'warning'}>
    {paid ? 'Cobrado' : checkoutPending ? 'Checkout pendiente' : 'Sin cobrar'}</Badge>
    {paid && <span>{paymentMethodLabels[appointment.charge?.method || appointment.paymentMethod] || 'Pago registrado'}</span>}
  </span>;
}

export function AppointmentCard({ appointment, onUpdated, statusControl, showDate = false }) {
  const charge = appointment.charge;
  const time = new Intl.DateTimeFormat('es-AR', { timeZone: AGENDA_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(appointment.startAt));
  return <Card as="article" className="admin-card appointment-card"><Card.Body>
    <div className="appointment-card-heading">
      <time className="appointment-time" dateTime={appointment.startAt}>{time}</time>
      <div className="appointment-person"><h2>{appointment.customer?.name || `Turno #${appointment.id}`}</h2><p>{appointment.serviceName}</p></div>
      <strong className="appointment-price">{formatPrice(appointment.servicePrice)}</strong>
    </div>
    {showDate && <p className="appointment-card-date">{formatAgendaDate(appointment.startAt)}</p>}
    <div className="appointment-state-row"><Badge bg={statusVariants[appointment.status] || 'secondary'}>{statusLabels[appointment.status]}</Badge>
      <AppointmentPayment appointment={appointment} />
      {appointment.barber?.name && <span className="appointment-barber">{appointment.barber.name}</span>}
    </div>
    <AppointmentActions appointment={appointment} onUpdated={onUpdated} />
    <details className="appointment-details"><summary>Ver detalle{charge ? ' del cobro' : ' del turno'}</summary>
      <div>{formatAgendaDate(appointment.startAt)} · {appointment.customer?.phone || 'Sin teléfono'}</div>
      {charge && <><div>{formatPrice(charge.amount)} · {paymentMethodLabels[charge.method]} · {formatAgendaDate(charge.paidAt)}</div>
        <div>Registrado por {charge.recordedBy?.email || (charge.recordedByUserId ? `usuario #${charge.recordedByUserId}` : 'Mercado Pago')}</div>
        {charge.dateSource !== 'operator' && <div>{charge.dateSource === 'verified_at' ? 'Fecha de verificación' : 'Fecha informada por Mercado Pago'}</div>}
      </>}
      {appointment.paymentStatus === 'paid' && !charge && <div>Pago histórico sin detalle de cobro.</div>}
      {appointment.completedAt && <div>Realizado: {formatAgendaDate(appointment.completedAt)} · {appointment.completedBy?.email || `usuario #${appointment.completedByUserId}`}</div>}
      {statusControl && <div className="mt-2">{statusControl}</div>}
    </details>
  </Card.Body></Card>;
}

export default function AppointmentActions({ appointment, onUpdated }) {
  const workflow = appointmentWorkflow(appointment);
  const [panel, setPanel] = useState(null);
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function open(kind) { setError(''); setNotice(''); setPanel(kind); setMethod('cash'); }

  async function perform(kind) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      let result;
      if (kind === 'refresh') result = await refreshAppointmentPayment(appointment.id);
      else if (kind === 'complete') result = await completeAppointment(appointment.id);
      else if (kind === 'combined') result = await completeAndCollectAppointment(appointment.id, method, appointment.servicePrice);
      else result = await collectAppointment(appointment.id, { method, amount: appointment.servicePrice });
      onUpdated(result);
      setPanel(null);
      setNotice(kind === 'refresh' ? (appointmentWorkflow(result).checkoutPending ? 'El checkout todavía no está resuelto.' : 'Estado de Mercado Pago actualizado.')
        : kind === 'combined' ? 'Servicio realizado y cobrado.' : kind === 'complete' ? 'Servicio realizado.' : 'Cobro registrado.');
    } catch (requestError) {
      setError(requestError.message || 'No pudimos guardar. Podés reintentar de forma segura.');
      if ([400, 409].includes(requestError.status)) {
        try { onUpdated(await getAppointment(appointment.id)); setPanel(null); } catch { /* Preserve the original error. */ }
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <div className="appointment-actions" aria-busy={busy}>
    {error && <Alert variant="warning" className="py-2 mb-2" role="alert">{error}</Alert>}
    {notice && <p className="appointment-feedback" role="status">{notice}</p>}
    {!panel && workflow.primary && <>
      <Button className="appointment-primary" variant="warning" disabled={busy} onClick={() => open(workflow.primary)}>{workflow.primaryLabel}</Button>
      <div className="appointment-secondary-actions">
        {workflow.canComplete && workflow.primary !== 'complete' && <Button variant="link" disabled={busy} onClick={() => open('complete')}>Solo marcar realizado</Button>}
        {workflow.canCollect && workflow.primary !== 'charge' && <Button variant="link" disabled={busy} onClick={() => open('charge')}>Solo registrar cobro</Button>}
      </div>
    </>}
    {!panel && workflow.operable && workflow.checkoutPending && <div className="appointment-checkout-note">
      <span>El cobro presencial está bloqueado hasta resolver Mercado Pago.</span>
      <Button variant="link" disabled={busy} onClick={() => perform('refresh')}>{busy ? 'Verificando…' : 'Verificar estado'}</Button>
    </div>}
    {panel && <div className="appointment-inline-panel">
      <strong>{panel === 'combined' ? 'Finalizar y cobrar' : panel === 'charge' ? 'Registrar cobro' : 'Marcar realizado'}</strong>
      {panel !== 'complete' ? <>
        <div className="appointment-methods" role="group" aria-label="Método de cobro">
          <Button variant={method === 'cash' ? 'warning' : 'outline-light'} aria-pressed={method === 'cash'} disabled={busy} onClick={() => setMethod('cash')}>Efectivo</Button>
          <Button variant={method === 'transfer' ? 'warning' : 'outline-light'} aria-pressed={method === 'transfer'} disabled={busy} onClick={() => setMethod('transfer')}>Transferencia</Button>
        </div>
        <p className="appointment-confirm-copy">{method === 'transfer' ? 'Confirmá solo si ya recibiste la transferencia.' : 'Confirmá que recibiste el efectivo.'} {panel === 'combined' && 'También se marcará realizado.'}</p>
      </> : <p className="appointment-confirm-copy">Se guardará el corte como realizado, sin registrar otro cobro.</p>}
      <div className="appointment-confirm-actions">
        <Button variant="warning" disabled={busy || !workflow.operable || (panel !== 'complete' && !workflow.canCollect)} onClick={() => perform(panel)}>
          {busy ? 'Guardando…' : panel === 'complete' ? 'Confirmar realizado' : `Confirmar ${paymentMethodLabels[method].toLowerCase()} · ${formatPrice(appointment.servicePrice)}`}
        </Button>
        <Button variant="outline-light" disabled={busy} onClick={() => setPanel(null)}>Volver</Button>
      </div>
    </div>}
  </div>;
}
