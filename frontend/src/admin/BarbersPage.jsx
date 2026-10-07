import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Form, Modal, Spinner, Table } from 'react-bootstrap';
import { createBarber, getAdminBarbers, updateBarber } from '../services/api.js';

const emptyForm = { name: '', phone: '', image: '', active: true };

export default function BarbersPage() {
  const [barbers, setBarbers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  async function loadBarbers() {
    setLoading(true);
    try { setBarbers(await getAdminBarbers()); }
    catch (requestError) { setError(requestError.message || 'No pudimos cargar los barberos.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadBarbers(); }, []);

  function openCreate() { setEditing(null); setForm(emptyForm); setError(''); setShowModal(true); }
  function openEdit(barber) {
    setEditing(barber);
    setForm({ name: barber.name, phone: barber.phone || '', image: barber.image || '', active: barber.active });
    setError(''); setShowModal(true);
  }

  async function save(event) {
    event.preventDefault(); setSaving(true); setError('');
    const payload = { name: form.name.trim(), phone: form.phone.trim() || null, image: form.image.trim() || null };
    try {
      if (editing) await updateBarber(editing.id, { ...payload, active: form.active });
      else await createBarber(payload);
      setShowModal(false); await loadBarbers();
    } catch (requestError) { setError(requestError.message || 'No pudimos guardar el barbero.'); }
    finally { setSaving(false); }
  }

  async function toggleActive(barber) {
    setBusyId(barber.id); setError('');
    try { await updateBarber(barber.id, { active: !barber.active }); await loadBarbers(); }
    catch (requestError) { setError(requestError.message || 'No pudimos cambiar el estado del barbero.'); }
    finally { setBusyId(null); }
  }

  return <>
    <div className="admin-toolbar"><p>Gestioná el equipo y sus datos de contacto.</p><Button variant="warning" onClick={openCreate}>＋ Nuevo barbero</Button></div>
    {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}
    <Card className="admin-card">
      {loading ? <div className="admin-loading"><Spinner animation="border" role="status" /><span>Cargando barberos…</span></div> : barbers.length ? <div className="table-responsive"><Table className="admin-table align-middle mb-0"><thead><tr><th>Barbero</th><th>Teléfono</th><th>Imagen</th><th>Estado</th><th className="text-end">Acciones</th></tr></thead><tbody>
        {barbers.map((barber) => <tr key={barber.id}><td><div className="admin-person"><span className="admin-avatar">{barber.image ? <img src={barber.image} alt="" /> : barber.name.charAt(0).toUpperCase()}</span><strong>{barber.name}</strong></div></td><td>{barber.phone || '—'}</td><td className="admin-image-path">{barber.image || '—'}</td><td><Badge bg={barber.active ? 'success' : 'secondary'}>{barber.active ? 'Activo' : 'Inactivo'}</Badge></td><td><div className="admin-row-actions"><Button variant="outline-light" size="sm" onClick={() => openEdit(barber)}>Editar</Button><Button variant={barber.active ? 'outline-danger' : 'outline-success'} size="sm" disabled={busyId === barber.id} onClick={() => toggleActive(barber)}>{barber.active ? 'Desactivar' : 'Activar'}</Button></div></td></tr>)}
      </tbody></Table></div> : <p className="admin-empty mb-0">Todavía no hay barberos.</p>}
    </Card>
    <Modal show={showModal} onHide={() => !saving && setShowModal(false)} centered contentClassName="admin-modal"><Form onSubmit={save}>
      <Modal.Header closeButton><Modal.Title>{editing ? 'Editar barbero' : 'Nuevo barbero'}</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3"><Form.Label>Nombre</Form.Label><Form.Control required maxLength={255} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Form.Group>
        <Form.Group className="mb-3"><Form.Label>Teléfono</Form.Label><Form.Control type="tel" maxLength={50} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Form.Group>
        <Form.Group className="mb-3"><Form.Label>Imagen (URL o ruta)</Form.Label><Form.Control maxLength={255} value={form.image} onChange={(event) => setForm({ ...form, image: event.target.value })} /><Form.Text>Ingresá una URL o ruta existente. No se suben archivos.</Form.Text></Form.Group>
        {editing && <Form.Check type="switch" label="Barbero activo" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />}
        {error && <Alert variant="warning" className="mt-3 mb-0">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer><Button variant="outline-light" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</Button><Button variant="warning" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar barbero'}</Button></Modal.Footer>
    </Form></Modal>
  </>;
}
