import { lazy } from 'react';
import { Alert, Button, Container, Nav } from 'react-bootstrap';
import { LazyModuleBoundary, LazyModuleSuspense } from '../components/ModuleLoadBoundary.jsx';

const AdminDashboard = lazy(() => import('./DashboardPage.jsx'));
const AppointmentsPage = lazy(() => import('./AppointmentsPage.jsx'));
const ServicesPage = lazy(() => import('./ServicesPage.jsx'));
const BarbersPage = lazy(() => import('./BarbersPage.jsx'));
const SchedulesPage = lazy(() => import('./SchedulesPage.jsx'));
const ChangePasswordPage = lazy(() => import('./ChangePasswordPage.jsx'));
const MyAgendaPage = lazy(() => import('./MyAgendaPage.jsx'));
const UsersPage = lazy(() => import('./UsersPage.jsx'));

const sections = [
  { path: '/admin', label: 'Resumen' },
  { path: '/admin/appointments', label: 'Turnos' },
  { path: '/admin/services', label: 'Servicios' },
  { path: '/admin/barbers', label: 'Barberos' },
  { path: '/admin/users', label: 'Usuarios' },
  { path: '/admin/schedules', label: 'Horarios' },
  { path: '/admin/password', label: 'Cambiar contraseña' },
];

const pages = {
  '/admin': [AdminDashboard, 'Resumen'],
  '/admin/appointments': [AppointmentsPage, 'Turnos'],
  '/admin/services': [ServicesPage, 'Servicios'],
  '/admin/barbers': [BarbersPage, 'Barberos'],
  '/admin/users': [UsersPage, 'Usuarios'],
  '/admin/schedules': [SchedulesPage, 'Horarios'],
  '/admin/password': [ChangePasswordPage, 'Cambiar contraseña'],
};

export default function AdminLayout({ user, onLogout, logoutError }) {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/admin';
  const isBarber = user?.role === 'barber';
  const visibleSections = isBarber ? [{ path: '/admin/agenda', label: 'Mi agenda' }] : sections;
  const [Page, title] = isBarber ? [MyAgendaPage, 'Mi agenda'] : pages[pathname] || pages['/admin'];

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <Container fluid className="d-flex align-items-center justify-content-between gap-3">
          <a href="/admin" className="admin-brand"><span className="brand-mark">B.</span> Administración</a>
          <a href="/" className="admin-public-link">Ver sitio público ↗</a>
          <Button variant="outline-warning" size="sm" onClick={onLogout}>Cerrar sesión</Button>
        </Container>
      </header>
      <Container fluid className="admin-container py-4 py-lg-5">
        <div className="row g-4">
          <aside className="col-12 col-lg-3 col-xl-2">
            <div className="admin-sidebar">
              <div className="admin-sidebar-title">PANEL</div>
              <Nav className="admin-nav flex-row flex-lg-column flex-nowrap overflow-auto" variant="pills">
                {visibleSections.map((section) => (
                  <Nav.Link key={section.path} href={section.path} active={pathname === section.path}>
                    {section.label}
                  </Nav.Link>
                ))}
              </Nav>
            </div>
          </aside>
          <main className="col-12 col-lg-9 col-xl-10">
            {logoutError && <Alert variant="warning" role="alert">{logoutError}</Alert>}
            <div className="admin-heading mb-4">
              <div className="eyebrow">GESTIÓN DE BARBERÍA</div>
              <h1>{title}</h1>
            </div>
            <LazyModuleBoundary>
              <LazyModuleSuspense label={`Cargando ${title.toLowerCase()}…`}><Page /></LazyModuleSuspense>
            </LazyModuleBoundary>
          </main>
        </div>
      </Container>
    </div>
  );
}
