import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Form, Modal, Spinner, Table } from 'react-bootstrap';
import { createService, getAdminServices, updateService } from '../services/api.js';
import { formatPrice } from './adminUtils.js';

const emptyForm = { name: '', description: '', price: '', active: true };

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  async function loadServices() {
    setLoading(true);
    try { setServices(await getAdminServices()); }
    catch (requestError) { setError(requestError.message || 'No pudimos cargar los servicios.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadServices(); }, []);

  function openCreate() { setEditing(null); setForm(emptyForm); setError(''); setShowModal(true); }
  function openEdit(service) {
    setEditing(service);
    setForm({ name: service.name, description: service.description || '', price: String(service.price), active: service.active });
    setError(''); setShowModal(true);
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true); setError('');
    const payload = { name: form.name.trim(), description: form.description.trim() || null, price: Number(form.price) };
    try {
      if (editing) await updateService(editing.id, { ...payload, active: form.active });
      else await createService(payload);
      setShowModal(false);
      await loadServices();
    } catch (requestError) { setError(requestError.message || 'No pudimos guardar el servicio.'); }
    finally { setSaving(false); }
  }

  async function toggleActive(service) {
    setBusyId(service.id); setError('');
    try {
      await updateService(service.id, { active: !service.active });
      await loadServices();
    } catch (requestError) { setError(requestError.message || 'No pudimos cambiar el estado del servicio.'); }
    finally { setBusyId(null); }
  }

  return <>
    <div className="admin-toolbar"><p>Administrá el menú que se muestra en las reservas.</p><Button variant="warning" onClick={openCreate}>＋ Nuevo servicio</Button></div>
    {error && <Alert variant="warning" dismissible onClose={() => setError('')}>{error}</Alert>}
    <Card className="admin-card">
      {loading ? <div className="admin-loading"><Spinner animation="border" role="status" /><span>Cargando servicios…</span></div> : services.length ? <div className="table-responsive"><Table className="admin-table align-middle mb-0"><thead><tr><th>Servicio</th><th>Precio</th><th>Estado</th><th className="text-end">Acciones</th></tr></thead><tbody>
        {services.map((service) => <tr key={service.id}><td><strong>{service.name}</strong><small>{service.description || 'Sin descripción'}</small></td><td>{formatPrice(service.price)}</td><td><Badge bg={service.active ? 'success' : 'secondary'}>{service.active ? 'Activo' : 'Inactivo'}</Badge></td><td><div className="admin-row-actions"><Button variant="outline-light" size="sm" onClick={() => openEdit(service)}>Editar</Button><Button variant={service.active ? 'outline-danger' : 'outline-success'} size="sm" disabled={busyId === service.id} onClick={() => toggleActive(service)}>{service.active ? 'Desactivar' : 'Activar'}</Button></div></td></tr>)}
      </tbody></Table></div> : <p className="admin-empty mb-0">Todavía no hay servicios.</p>}
    </Card>
    <Modal show={showModal} onHide={() => !saving && setShowModal(false)} centered contentClassName="admin-modal"><Form onSubmit={save}>
      <Modal.Header closeButton><Modal.Title>{editing ? 'Editar servicio' : 'Nuevo servicio'}</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3"><Form.Label>Nombre</Form.Label><Form.Control required maxLength={255} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Form.Group>
        <Form.Group className="mb-3"><Form.Label>Descripción</Form.Label><Form.Control as="textarea" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Form.Group>
        <Form.Group className="mb-3"><Form.Label>Precio</Form.Label><Form.Control required type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Form.Group>
        {editing && <Form.Check type="switch" label="Servicio activo" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />}
        {error && <Alert variant="warning" className="mt-3 mb-0">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer><Button variant="outline-light" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</Button><Button variant="warning" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar servicio'}</Button></Modal.Footer>
    </Form></Modal>
  </>;
}
