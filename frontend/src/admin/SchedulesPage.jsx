import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Modal, Spinner, Table } from 'react-bootstrap';
import { createBarberSchedule, deleteBarberSchedule, getAdminBarbers, getBarberSchedules, updateBarberSchedule } from '../services/api.js';

const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const emptyForm = { dayOfWeek: '1', startTime: '09:00', endTime: '17:00' };

export default function SchedulesPage() {
  const [barbers, setBarbers] = useState([]);
  const [barberId, setBarberId] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loadingBarbers, setLoadingBarbers] = useState(true);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getAdminBarbers().then((items) => {
      if (!active) return;
      setBarbers(items);
      if (items.length) setBarberId(String(items[0].id));
    }).catch((requestError) => { if (active) setError(requestError.message || 'No pudimos cargar los barberos.'); })
      .finally(() => { if (active) setLoadingBarbers(false); });
    return () => { active = false; };
  }, []);

  async function loadSchedules(id = barberId) {
    if (!id) { setSchedules([]); return; }
    setLoadingSchedules(true); setError('');
    try { setSchedules(await getBarberSchedules(id)); }
    catch (requestError) { setError(requestError.message || 'No pudimos cargar los horarios.'); }
    finally { setLoadingSchedules(false); }
  }

  useEffect(() => { loadSchedules(barberId); }, [barberId]);

  function openCreate() { setEditing(null); setForm(emptyForm); setError(''); setShowModal(true); }
  function openEdit(schedule) {
    setEditing(schedule);
    setForm({ dayOfWeek: String(schedule.dayOfWeek), startTime: schedule.startTime.slice(0, 5), endTime: schedule.endTime.slice(0, 5) });
    setError(''); setShowModal(true);
  }

  async function save(event) {
    event.preventDefault(); setSaving(true); setError('');
    const payload = { dayOfWeek: Number(form.dayOfWeek), startTime: form.startTime, endTime: form.endTime };
    try {
      if (editing) await updateBarberSchedule(barberId, editing.id, payload);
      else await createBarberSchedule(barberId, payload);
      setShowModal(false); await loadSchedules();
    } catch (requestError) {
      setError(requestError.status === 409 ? 'Ya existe un horario para ese día. Editá el bloque existente.' : requestError.message || 'No pudimos guardar el horario.');
    } finally { setSaving(false); }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setSaving(true); setError('');
    try { await deleteBarberSchedule(barberId, deleting.id); setDeleting(null); await loadSchedules(); }
    catch (requestError) { setError(requestError.message || 'No pudimos eliminar el horario.'); }
    finally { setSaving(false); }
  }

  const sortedSchedules = [...schedules].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const selectedBarber = barbers.find((item) => String(item.id) === barberId);

  return <>
    <div className="admin-schedule-toolbar">
      <Form.Group className="admin-barber-picker"><Form.Label>Barbero</Form.Label><Form.Select value={barberId} disabled={loadingBarbers || !barbers.length} onChange={(event) => setBarberId(event.target.value)}><option value="">Seleccionar barbero</option>{barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}{!barber.active ? ' (inactivo)' : ''}</option>)}</Form.Select></Form.Group>
      <Button variant="warning" onClick={openCreate} disabled={!barberId}>＋ Nuevo horario</Button>
    </div>
    <p className="admin-hint">Cada barbero puede tener un único bloque de trabajo por día.</p>
    {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}
    <Card className="admin-card">
      {loadingBarbers || loadingSchedules ? <div className="admin-loading"><Spinner animation="border" role="status" /><span>Cargando horarios…</span></div> : !selectedBarber ? <p className="admin-empty mb-0">Primero agregá un barbero para configurar sus horarios.</p> : sortedSchedules.length ? <div className="table-responsive"><Table className="admin-table align-middle mb-0"><thead><tr><th>Día</th><th>Desde</th><th>Hasta</th><th className="text-end">Acciones</th></tr></thead><tbody>{sortedSchedules.map((schedule) => <tr key={schedule.id}><td><strong>{dayNames[schedule.dayOfWeek] || '—'}</strong></td><td>{schedule.startTime.slice(0, 5)}</td><td>{schedule.endTime.slice(0, 5)}</td><td><div className="admin-row-actions"><Button variant="outline-light" size="sm" onClick={() => openEdit(schedule)}>Editar</Button><Button variant="outline-danger" size="sm" onClick={() => setDeleting(schedule)}>Eliminar</Button></div></td></tr>)}</tbody></Table></div> : <p className="admin-empty mb-0">{selectedBarber.name} todavía no tiene horarios configurados.</p>}
    </Card>

    <Modal show={showModal} onHide={() => !saving && setShowModal(false)} centered contentClassName="admin-modal"><Form onSubmit={save}>
      <Modal.Header closeButton><Modal.Title>{editing ? 'Editar horario' : 'Nuevo horario'}</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3"><Form.Label>Día de la semana</Form.Label><Form.Select value={form.dayOfWeek} onChange={(event) => setForm({ ...form, dayOfWeek: event.target.value })}>{dayNames.map((day, index) => <option key={day} value={index}>{day}</option>)}</Form.Select></Form.Group>
        <div className="row g-3"><Form.Group className="col-6"><Form.Label>Desde</Form.Label><Form.Control required type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></Form.Group><Form.Group className="col-6"><Form.Label>Hasta</Form.Label><Form.Control required type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></Form.Group></div>
        {error && <Alert variant="warning" className="mt-3 mb-0">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer><Button variant="outline-light" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</Button><Button variant="warning" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar horario'}</Button></Modal.Footer>
    </Form></Modal>

    <Modal show={Boolean(deleting)} onHide={() => !saving && setDeleting(null)} centered contentClassName="admin-modal">
      <Modal.Header closeButton><Modal.Title>Eliminar horario</Modal.Title></Modal.Header>
      <Modal.Body>¿Eliminar el horario del {deleting && dayNames[deleting.dayOfWeek]} para {selectedBarber?.name}?</Modal.Body>
      <Modal.Footer><Button variant="outline-light" onClick={() => setDeleting(null)} disabled={saving}>Cancelar</Button><Button variant="danger" onClick={confirmDelete} disabled={saving}>{saving ? 'Eliminando…' : 'Eliminar horario'}</Button></Modal.Footer>
    </Modal>
  </>;
}
