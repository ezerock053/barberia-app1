import { useState } from 'react';
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';
import { ApiError, changeAdminPassword } from '../services/api.js';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (Array.from(newPassword).length < 12) {
      setError('La nueva contraseña debe tener al menos 12 caracteres.');
      return;
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setError('La nueva contraseña supera el máximo permitido.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }

    setSubmitting(true);
    try {
      await changeAdminPassword({ currentPassword, newPassword, confirmPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      window.location.replace('/admin/login?passwordChanged=1');
    } catch (requestError) {
      setError(requestError instanceof ApiError && requestError.status === 400
        ? requestError.message
        : 'No pudimos cambiar la contraseña. Intentá nuevamente.');
      setSubmitting(false);
    }
  }

  return (
    <Card className="admin-card">
      <Card.Header><div><strong>Actualizar credenciales</strong><span>Vas a tener que iniciar sesión nuevamente.</span></div></Card.Header>
      <Card.Body className="p-4">
        {error && <Alert variant="danger" role="alert">{error}</Alert>}
        <Form onSubmit={submit}>
          <Form.Group className="mb-3" controlId="current-admin-password">
            <Form.Label>Contraseña actual</Form.Label>
            <Form.Control type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          </Form.Group>
          <Form.Group className="mb-3" controlId="new-admin-password">
            <Form.Label>Nueva contraseña</Form.Label>
            <Form.Control type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={12} required />
            <Form.Text className="muted-copy">Usá al menos 12 caracteres.</Form.Text>
          </Form.Group>
          <Form.Group className="mb-4" controlId="confirm-admin-password">
            <Form.Label>Confirmar nueva contraseña</Form.Label>
            <Form.Control type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} required />
          </Form.Group>
          <Button type="submit" variant="warning" disabled={submitting}>
            {submitting ? <><Spinner size="sm" className="me-2" />Cambiando…</> : 'Cambiar contraseña'}
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
}
