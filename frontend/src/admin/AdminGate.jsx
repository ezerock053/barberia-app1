import { lazy, useEffect, useRef, useState } from 'react';
import { Alert, Button, Container, Spinner } from 'react-bootstrap';
import { LazyModuleSuspense } from '../components/ModuleLoadBoundary.jsx';
import { adminLoginHref, currentAdminDestination } from './adminNavigation.js';
import { getAdminSession, logoutAdmin, setAdminUnauthorizedHandler } from '../services/api.js';

const AdminLayout = lazy(() => import('./AdminLayout.jsx'));
const AdminLoginPage = lazy(() => import('./AdminLoginPage.jsx'));

function AdminSessionCheck() {
  const [status, setStatus] = useState('checking');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const redirecting = useRef(false);

  useEffect(() => {
    let mounted = true;
    function redirectToLogin() {
      if (!mounted || redirecting.current) return;
      redirecting.current = true;
      window.location.replace(adminLoginHref(currentAdminDestination()));
    }

    setAdminUnauthorizedHandler(redirectToLogin);
    getAdminSession()
      .then(({ admin }) => {
        if (!mounted) return;
        if (!['owner', 'barber'].includes(admin?.role)) throw new Error('Rol inválido');
        if (admin.role === 'barber' && window.location.pathname !== '/admin/agenda') {
          window.location.replace('/admin/agenda');
          return;
        }
        setUser(admin);
        setStatus('authenticated');
      })
      .catch((requestError) => {
        if (!mounted) return;
        if (requestError.status === 401) return redirectToLogin();
        setError('No pudimos comprobar la sesión. Intentá nuevamente.');
        setStatus('error');
      });

    return () => {
      mounted = false;
      setAdminUnauthorizedHandler(null);
    };
  }, []);

  async function handleLogout() {
    setLogoutError('');
    try {
      await logoutAdmin();
      setStatus('signed-out');
      window.location.replace('/admin/login');
    } catch (requestError) {
      if (requestError.status === 401) {
        setStatus('signed-out');
        window.location.replace('/admin/login');
        return;
      }
      setLogoutError('No pudimos cerrar la sesión. Revisá tu conexión e intentá nuevamente.');
    }
  }

  if (status === 'checking' || status === 'signed-out') {
    return <main className="admin-auth-shell"><div className="admin-auth-loading"><Spinner animation="border" role="status" /><span>Verificando sesión…</span></div></main>;
  }
  if (status === 'error') {
    return <main className="admin-auth-shell"><Container className="admin-auth-error"><Alert variant="warning">{error}</Alert><Button variant="outline-warning" onClick={() => window.location.reload()}>Intentar nuevamente</Button></Container></main>;
  }
  return <LazyModuleSuspense fullPage label="Cargando el panel…">
    <AdminLayout user={user} onLogout={handleLogout} logoutError={logoutError} />
  </LazyModuleSuspense>;
}

export default function AdminGate() {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/admin';
  if (pathname === '/admin/login') return <LazyModuleSuspense fullPage label="Cargando el acceso…"><AdminLoginPage /></LazyModuleSuspense>;
  return <AdminSessionCheck />;
}
