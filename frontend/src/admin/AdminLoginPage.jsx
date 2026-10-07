import { useState } from 'react';
import { Alert, Button, Card, Container, Form, Spinner } from 'react-bootstrap';
import { loginAdmin } from '../services/api.js';
import { safeAdminReturnTo } from './adminNavigation.js';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const returnTo = safeAdminReturnTo(new URLSearchParams(window.location.search).get('redirect'));
  const passwordChanged = new URLSearchParams(window.location.search).get('passwordChanged') === '1';

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await loginAdmin({ email, password });
      window.location.replace(returnTo);
    } catch (requestError) {
      setError(requestError.status === 401
        ? 'El email o la contraseña no son correctos.'
        : 'No pudimos iniciar sesión. Revisá tu conexión e intentá nuevamente.');
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-auth-shell">
      <Container className="admin-auth-container">
        <Card className="admin-auth-card">
          <Card.Body>
            <a href="/#inicio" className="admin-brand admin-auth-brand"><span className="brand-mark">B.</span> Administración</a>
            <div className="eyebrow mt-4">ACCESO ADMINISTRATIVO</div>
            <h1>Ingresar</h1>
            <p className="admin-auth-copy">Usá las credenciales de administrador para continuar.</p>
            {passwordChanged && <Alert variant="success" role="status">La contraseña se cambió. Ingresá con tu nueva contraseña.</Alert>}
            {error && <Alert variant="danger" role="alert">{error}</Alert>}
            <Form onSubmit={submit}>
              <Form.Group className="mb-3" controlId="admin-email">
                <Form.Label>Email</Form.Label>
                <Form.Control
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoFocus
                />
              </Form.Group>
              <Form.Group className="mb-4" controlId="admin-password">
                <Form.Label>Contraseña</Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Form.Group>
              <Button type="submit" variant="warning" className="w-100" disabled={submitting}>
                {submitting ? <><Spinner size="sm" className="me-2" />Ingresando…</> : 'Ingresar'}
              </Button>
            </Form>
          </Card.Body>
        </Card>
      </Container>
    </main>
  );
}
