const frame = document.querySelector('iframe');
const pause = () => new Promise((resolve) => setTimeout(resolve, 25));
function check(value, message) { if (!value) throw new Error(message); }
async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 400; attempt++) {
    try { if (predicate()) return; } catch { /* The iframe may still be navigating. */ }
    await pause();
  }
  throw new Error(`Timed out: ${message}`);
}
function documentInFrame() { return frame.contentDocument; }
function jsResources() {
  return documentInFrame().defaultView.performance.getEntriesByType('resource')
    .map((entry) => new URL(entry.name).pathname.split('/').pop())
    .filter((name) => name.endsWith('.js'));
}
async function navigate(path, heading) {
  frame.src = path;
  await waitFor(() => documentInFrame().querySelector('h1')?.textContent.includes(heading), `${path} heading`);
}
async function assertChunk(name) {
  await waitFor(() => jsResources().some((resource) => resource.startsWith(`${name}-`)), `${name} chunk`);
}
async function assertNoChunks(names, context) {
  const resources = jsResources();
  for (const name of names) check(!resources.some((resource) => resource.startsWith(`${name}-`)), `${context} downloaded ${name}`);
}
async function run() {
  const pageChunks = ['DashboardPage', 'AppointmentsPage', 'ServicesPage', 'BarbersPage', 'SchedulesPage', 'ChangePasswordPage', 'UsersPage'];

  await navigate('/', 'Tu estilo.');
  check(jsResources().some((name) => name.startsWith('index-')), 'Public entry bundle was not requested');
  await assertNoChunks(['AdminGate', 'AdminLoginPage', 'AdminLayout', ...pageChunks, 'MyAgendaPage'], 'Public route');

  await navigate('/admin/login?__role=owner', 'Ingresar');
  await assertChunk('AdminGate'); await assertChunk('AdminLoginPage');
  await assertNoChunks(['AdminLayout', ...pageChunks, 'MyAgendaPage'], 'Login route');

  await navigate('/admin/agenda?__role=barber', 'Mi agenda');
  await assertChunk('AdminGate'); await assertChunk('AdminLayout'); await assertChunk('MyAgendaPage');
  await assertNoChunks(['AdminLoginPage', ...pageChunks], 'Barber agenda');

  const ownerRoutes = [
    ['/admin?__role=owner', 'Resumen', 'DashboardPage'],
    ['/admin/appointments?__role=owner', 'Turnos', 'AppointmentsPage'],
    ['/admin/services?__role=owner', 'Servicios', 'ServicesPage'],
    ['/admin/barbers?__role=owner', 'Barberos', 'BarbersPage'],
    ['/admin/schedules?__role=owner', 'Horarios', 'SchedulesPage'],
    ['/admin/password?__role=owner', 'Cambiar contraseña', 'ChangePasswordPage'],
    ['/admin/users?__role=owner', 'Usuarios', 'UsersPage'],
  ];
  for (const [route, heading, chunk] of ownerRoutes) {
    await navigate(route, heading);
    await assertChunk('AdminGate'); await assertChunk('AdminLayout'); await assertChunk(chunk);
  }
  await navigate('/admin/unknown-section?__role=owner', 'Resumen');
  await assertChunk('DashboardPage');

  await navigate('/admin/services?__role=barber', 'Mi agenda');
  check(documentInFrame().defaultView.location.pathname === '/admin/agenda', 'Barber was not redirected to their agenda');
  await assertChunk('MyAgendaPage');
  await assertNoChunks(pageChunks, 'Barber restricted route');

  await navigate('/admin?__role=anonymous', 'Ingresar');
  await assertChunk('AdminLoginPage');
  await assertNoChunks(['AdminLayout', ...pageChunks, 'MyAgendaPage'], 'Unauthenticated route');

  await fetch('/__fail-agenda-once');
  await navigate('/admin/agenda?__role=barber', 'Mi agenda');
  await waitFor(() => documentInFrame().body.textContent.includes('No pudimos cargar esta sección'), 'lazy import error boundary');
  check(documentInFrame().querySelector('[role="alert"]')?.textContent.includes('Revisá tu conexión'), 'Error fallback is not informative');
  const retry = [...documentInFrame().querySelectorAll('button')].find((button) => button.textContent.includes('Reintentar'));
  check(retry, 'Retry control is missing'); retry.click();
  await waitFor(() => documentInFrame().querySelector('.agenda-toolbar'), 'agenda after retry');
  await assertChunk('MyAgendaPage');

  document.getElementById('result').textContent = JSON.stringify({ passed: true, checkedSections: ownerRoutes.length });
}
run().catch((error) => {
  const doc = documentInFrame();
  document.getElementById('result').textContent = JSON.stringify({
    passed: false, error: error.message, page: doc?.body?.innerText,
    href: doc?.defaultView?.location?.href, resources: jsResources(),
  });
});
