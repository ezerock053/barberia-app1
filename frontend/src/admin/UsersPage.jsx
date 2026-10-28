import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Spinner, Table } from 'react-bootstrap';
import { createUser, getAdminBarbers, getUsers } from '../services/api.js';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [barberId, setBarberId] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getUsers(), getAdminBarbers()]).then(([accounts, professionals]) => {
      if (active) { setUsers(accounts); setBarbers(professionals); }
    }).catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { user } = await createUser({ email, password, role: 'barber', barberId: Number(barberId) });
      setUsers((current) => [...current, { ...user, active: true }]);
      setEmail(''); setBarberId('');
    } catch (requestError) {
      setError(requestError.message || 'No pudimos crear el acceso.');
    } finally { setPassword(''); setSaving(false); }
  }

  if (loading) return <Spinner animation="border" role="status"><span className="visually-hidden">Cargando usuarios</span></Spinner>;
  const availableBarbers = barbers.filter((barber) => barber.active && !users.some((user) => user.barberId === barber.id));
  return <>
    {error && <Alert variant="warning">{error}</Alert>}
    <Card className="admin-card mb-4"><Card.Body>
      <h2 className="h5">Crear acceso de barbero</h2>
      <Form onSubmit={submit}>
        <Form.Group className="mb-3" controlId="user-barber"><Form.Label>Barbero</Form.Label>
          <Form.Select value={barberId} onChange={(event) => setBarberId(event.target.value)} required disabled={saving}>
            <option value="">Elegí un barbero sin acceso</option>
            {availableBarbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-3" controlId="user-email"><Form.Label>Email de acceso</Form.Label>
          <Form.Control type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={saving} />
        </Form.Group>
        <Form.Group className="mb-3" controlId="user-password"><Form.Label>Contraseña inicial</Form.Label>
          <Form.Control type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required disabled={saving} />
          <Form.Text>Al menos 12 caracteres y hasta 72 bytes UTF-8.</Form.Text>
        </Form.Group>
        <Button type="submit" variant="warning" disabled={saving || !availableBarbers.length}>{saving ? 'Creando…' : 'Crear acceso'}</Button>
      </Form>
    </Card.Body></Card>
    <div className="admin-card table-responsive"><Table className="admin-table mb-0">
      <thead><tr><th>Email</th><th>Rol</th><th>Barbero</th><th>Acceso</th></tr></thead>
      <tbody>{users.map((user) => <tr key={user.id}><td>{user.email}</td><td>{user.role === 'owner' ? 'Dueño' : 'Barbero'}</td>
        <td>{barbers.find((barber) => barber.id === user.barberId)?.name || '—'}</td><td>{user.active ? 'Activo' : 'Inactivo'}</td></tr>)}</tbody>
    </Table></div>
  </>;
}
