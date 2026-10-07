import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Container, Form, Row, Spinner } from 'react-bootstrap';
import { ApiError, createAppointment, getAvailability, getBarbers, getServices } from '../services/api.js';

const steps = ['Servicio', 'Barbero', 'Fecha y hora', 'Tus datos', 'Confirmación'];
const emptyCustomer = { name: '', phone: '', email: '', notes: '' };

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function errorMessage(error) {
  if (!(error instanceof ApiError) || error.status === 0) return error.message || 'Ocurrió un error de conexión. Intentá nuevamente.';
  if (error.status === 400) return 'Revisá los datos ingresados. La fecha también debe estar dentro del período permitido para reservar.';
  if (error.status === 404) return 'El servicio o el barbero ya no está disponible. Volvé a elegir una opción.';
  if (error.status === 409) return 'Este horario acaba de ser reservado. Elegí otro horario.';
  return 'No pudimos completar la reserva. Intentá nuevamente en unos minutos.';
}

export default function BookingPage() {
  const [services, setServices] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [serviceId, setServiceId] = useState('');
  const [barberId, setBarberId] = useState('');
  const [date, setDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [slots, setSlots] = useState([]);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [step, setStep] = useState(1);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const today = useMemo(() => localDateString(new Date()), []);
  const maxDate = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    return localDateString(limit);
  }, []);

  const service = services.find((item) => String(item.id) === serviceId);
  const barber = barbers.find((item) => String(item.id) === barberId);

  useEffect(() => {
    let active = true;
    Promise.all([getServices(), getBarbers()])
      .then(([serviceList, barberList]) => {
        if (!active) return;
        setServices(serviceList);
        setBarbers(barberList);
      })
      .catch((requestError) => { if (active) setError(errorMessage(requestError)); })
      .finally(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setSelectedSlot('');
    setSlots([]);
    if (!serviceId || !barberId || !date || date < today || date > maxDate) {
      setLoadingSlots(false);
      return undefined;
    }
    let active = true;
    setLoadingSlots(true);
    setError('');
    getAvailability(barberId, date)
      .then((result) => { if (active) setSlots(result.availableSlots || []); })
      .catch((requestError) => { if (active) setError(errorMessage(requestError)); })
      .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [serviceId, barberId, date, today, maxDate]);

  function updateCustomer(field, value) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  function goNext() {
    setError('');
    setStep((current) => Math.min(current + 1, 5));
  }

  async function refreshSlots() {
    if (!barberId || !date) return;
    setSelectedSlot('');
    setLoadingSlots(true);
    try {
      const result = await getAvailability(barberId, date);
      setSlots(result.availableSlots || []);
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    } finally {
      setLoadingSlots(false);
    }
  }

  async function confirmBooking(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createAppointment({
        customer: {
          name: customer.name.trim(),
          phone: customer.phone.trim(),
          email: customer.email.trim(),
        },
        barberId: Number(barberId),
        serviceId: Number(serviceId),
        startAt: `${date} ${selectedSlot}:00`,
        paymentMethod,
        notes: customer.notes.trim(),
      });
      setConfirmation(true);
    } catch (submitError) {
      setError(errorMessage(submitError));
      if (submitError instanceof ApiError && submitError.status === 409) {
        setStep(3);
        await refreshSlots();
      } else if (submitError instanceof ApiError && submitError.status === 404) {
        setStep(1);
        setServiceId('');
        setBarberId('');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    const paymentMessage = paymentMethod === 'cash'
      ? 'Abonás en efectivo en la barbería.'
      : 'Elegiste Mercado Pago. Te indicaremos cómo completar el pago próximamente.';
    return <section className="page-section"><Container><Card className="booking-card confirmation-card mx-auto"><Card.Body className="text-center"><div className="confirmation-mark" aria-hidden="true">✓</div><div className="eyebrow">TE ESPERAMOS</div><h1 className="page-title">¡Turno reservado!</h1><p className="page-intro mx-auto">Tu reserva quedó registrada. {paymentMessage}</p><div className="confirmation-details text-start"><p><span>Servicio</span>{service?.name}</p><p><span>Barbero</span>{barber?.name}</p><p><span>Fecha</span>{formatDate(date)}</p><p><span>Hora</span>{selectedSlot}</p><p><span>Método de pago</span>{paymentMethod === 'cash' ? 'Efectivo' : 'Mercado Pago'}</p></div><Button variant="warning" href="#inicio" className="mt-3">Volver al inicio</Button></Card.Body></Card></Container></section>;
  }

  return <section className="page-section" id="reservar"><Container><div className="eyebrow">A TU MANERA</div><h1 className="page-title">Reservá tu turno</h1><p className="page-intro">Elegí lo que necesitás y encontrá un horario para vos.</p>
    <div className="booking-steps" aria-label="Progreso de reserva">{steps.map((label, index) => <div key={label} className={`booking-step ${step === index + 1 ? 'active' : ''} ${step > index + 1 ? 'complete' : ''}`}><span>{step > index + 1 ? '✓' : index + 1}</span><small>{label}</small></div>)}</div>
    {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}
    <Card className="booking-card"><Card.Body>
      {loadingOptions ? <div className="text-center py-5"><Spinner animation="border" role="status" /><span className="visually-hidden">Cargando opciones</span></div> : <>
        {step === 1 && <><h2 className="booking-step-title">Elegí un servicio</h2>{services.length ? <Row className="g-3">{services.map((item) => <Col md={6} lg={4} key={item.id}><Card className={`choice-card h-100 ${serviceId === String(item.id) ? 'selected' : ''}`}><Card.Body><Form.Check type="radio" name="service" id={`service-${item.id}`} value={item.id} checked={serviceId === String(item.id)} onChange={() => setServiceId(String(item.id))} label={<><strong>{item.name}</strong><span className="choice-description">{item.description || 'Un servicio pensado para que salgas impecable.'}</span><span className="choice-price">${Number(item.price).toLocaleString('es-AR')}</span></>} /></Card.Body></Card></Col>)}</Row> : <Alert variant="info">Por el momento no hay servicios disponibles para reservar.</Alert>}<div className="booking-actions"><Button variant="warning" onClick={goNext} disabled={!serviceId || !services.length}>Continuar</Button></div></>}
        {step === 2 && <><h2 className="booking-step-title">Elegí tu barbero</h2>{barbers.length ? <Row className="g-3">{barbers.map((item) => <Col sm={6} md={4} key={item.id}><Card className={`choice-card barber-choice h-100 ${barberId === String(item.id) ? 'selected' : ''}`}><Card.Body><Form.Check type="radio" name="barber" id={`barber-${item.id}`} value={item.id} checked={barberId === String(item.id)} onChange={() => setBarberId(String(item.id))} label={<><span className="barber-choice-avatar">{item.image ? <img src={item.image} alt="" /> : item.name?.charAt(0)?.toUpperCase()}</span><strong>{item.name}</strong></>} /></Card.Body></Card></Col>)}</Row> : <Alert variant="info">Por el momento no hay barberos disponibles.</Alert>}<div className="booking-actions"><Button variant="outline-light" onClick={() => setStep(1)}>Atrás</Button><Button variant="warning" onClick={goNext} disabled={!barberId || !barbers.length}>Continuar</Button></div></>}
        {step === 3 && <><h2 className="booking-step-title">Elegí el día y el horario</h2><Row className="g-3"><Col md={6}><Form.Group><Form.Label>Fecha</Form.Label><Form.Control type="date" min={today} max={maxDate} value={date} onChange={(event) => setDate(event.target.value)} /><Form.Text className="muted-copy">Podés reservar entre hoy y los próximos 30 días.</Form.Text></Form.Group></Col><Col md={6}><div className="availability"><Form.Label>Horarios disponibles</Form.Label>{!date ? <p className="muted-copy">Seleccioná una fecha para ver los horarios.</p> : loadingSlots ? <div><Spinner animation="border" size="sm" role="status" /> <span className="muted-copy">Buscando horarios…</span></div> : slots.length ? <div className="d-flex flex-wrap gap-2">{slots.map((slot) => <Button key={slot} type="button" variant={selectedSlot === slot ? 'warning' : 'outline-light'} className="slot-button" aria-pressed={selectedSlot === slot} onClick={() => setSelectedSlot(slot)}>{slot}</Button>)}</div> : <p className="muted-copy mb-0">No hay horarios disponibles para este día.</p>}</div></Col></Row><div className="booking-actions"><Button variant="outline-light" onClick={() => setStep(2)}>Atrás</Button><Button variant="warning" onClick={goNext} disabled={!selectedSlot || loadingSlots}>Continuar</Button></div></>}
        {step === 4 && <><h2 className="booking-step-title">Tus datos</h2><Form id="customer-details" onSubmit={(event) => { event.preventDefault(); goNext(); }}><Row className="g-3"><Col md={6}><Form.Group><Form.Label>Nombre</Form.Label><Form.Control autoComplete="name" value={customer.name} onChange={(event) => updateCustomer('name', event.target.value)} required maxLength={255} /></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Teléfono</Form.Label><Form.Control type="tel" autoComplete="tel" value={customer.phone} onChange={(event) => updateCustomer('phone', event.target.value)} required maxLength={50} /></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Email</Form.Label><Form.Control type="email" autoComplete="email" value={customer.email} onChange={(event) => updateCustomer('email', event.target.value)} required maxLength={255} /></Form.Group></Col><Col xs={12}><Form.Group><Form.Label>Observaciones <span className="muted-copy">(opcional)</span></Form.Label><Form.Control as="textarea" rows={3} value={customer.notes} onChange={(event) => updateCustomer('notes', event.target.value)} maxLength={255} /></Form.Group></Col></Row></Form><div className="booking-actions"><Button variant="outline-light" onClick={() => setStep(3)}>Atrás</Button><Button variant="warning" type="submit" form="customer-details">Ver resumen</Button></div></>}
        {step === 5 && <><h2 className="booking-step-title">Revisá tu reserva</h2><div className="booking-summary"><p><span>Servicio</span>{service?.name} · ${Number(service?.price || 0).toLocaleString('es-AR')}</p><p><span>Barbero</span>{barber?.name}</p><p><span>Fecha</span>{formatDate(date)}</p><p><span>Hora</span>{selectedSlot}</p><hr /><p><span>Nombre</span>{customer.name}</p><p><span>Teléfono</span>{customer.phone}</p><p><span>Email</span>{customer.email}</p><p><span>Observaciones</span>{customer.notes.trim() || 'Sin observaciones'}</p><Form.Group className="mt-3"><Form.Label>Método de pago</Form.Label><Form.Check type="radio" name="paymentMethod" id="payment-cash" value="cash" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} label="Efectivo" /><Form.Check type="radio" name="paymentMethod" id="payment-mercado-pago" value="mercado_pago" checked={paymentMethod === 'mercado_pago'} onChange={() => setPaymentMethod('mercado_pago')} label="Mercado Pago" /><Form.Text className="muted-copy">El pago no se procesa en esta etapa.</Form.Text></Form.Group></div><div className="booking-actions"><Button variant="outline-light" onClick={() => setStep(4)} disabled={submitting}>Editar datos</Button><Button variant="warning" onClick={confirmBooking} disabled={submitting}>{submitting ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Confirmando…</> : 'Confirmar turno'}</Button></div></>}
      </>}
    </Card.Body></Card>
  </Container></section>;
}
