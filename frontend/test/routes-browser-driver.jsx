const frame = document.querySelector('iframe');
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
const check = (value, message) => { if (!value) throw new Error(message); };
async function waitFor(predicate, name) {
  for (let i = 0; i < 300; i++) { try { if (predicate()) return; } catch { /* Navigation in progress. */ } await pause(); }
  throw new Error(`Tiempo agotado: ${name}`);
}
const documentInFrame = () => frame.contentDocument;
async function navigate(pathname, heading) {
  frame.src = pathname;
  await waitFor(() => !documentInFrame().getElementById('seo-prerender') && documentInFrame().querySelector('h1')?.textContent.includes(heading), heading);
}
async function run() {
  await navigate('/', 'Tu estilo.');
  const home = documentInFrame().body.textContent;
  for (const configured of ['Negocio de integración', 'IDENTIDAD CONFIGURADA', 'Presentación configurada', 'Servicios personalizados', 'Equipo personalizado', 'Lema personalizado']) check(home.includes(configured), `Texto sin configurar: ${configured}`);
  check(documentInFrame().querySelector('.navbar-brand').textContent.includes('Negocio de integración'), 'Navbar no usa nombre configurado');
  check(documentInFrame().querySelector('footer').textContent.includes('Negocio de integración'), 'Footer no usa nombre configurado');
  const navbar = documentInFrame().querySelector('.navbar-toggler');
  if (navbar) navbar.click();
  const services = documentInFrame().querySelector('a[href="/servicios"]');
  check(services, 'Falta enlace real a servicios'); services.click();
  await waitFor(() => frame.contentWindow.location.pathname === '/servicios' && documentInFrame().querySelector('h1')?.textContent === 'Servicios', 'navegación a servicios');
  frame.contentWindow.history.back();
  await waitFor(() => frame.contentWindow.location.pathname === '/' && documentInFrame().querySelector('h1')?.textContent.includes('Tu estilo.'), 'atrás');
  frame.contentWindow.history.forward();
  await waitFor(() => frame.contentWindow.location.pathname === '/servicios' && documentInFrame().querySelector('h1')?.textContent === 'Servicios', 'adelante');
  await navigate('/contacto', 'Contacto');
  check(documentInFrame().querySelector('main').textContent.includes('Dirección de ejemplo'), 'Contacto no usa configuración');
  await new Promise((resolve) => { frame.addEventListener('load', resolve, { once: true }); frame.contentWindow.location.reload(); });
  await waitFor(() => documentInFrame().querySelector('h1')?.textContent === 'Contacto', 'recarga directa');
  await navigate('/barberos', 'Nuestros barberos');
  await navigate('/reservar', 'Reservá tu turno');
  check(documentInFrame().querySelector('.page-intro').textContent === 'Reserva personalizada', 'Reserva no usa texto configurado');
  const headers = await fetch('/reservar');
  check(headers.headers.get('x-robots-tag') === 'noindex, follow', 'Reserva sin noindex HTTP');
  await navigate('/?origen=antiguo#servicios', 'Servicios');
  await waitFor(() => frame.contentWindow.location.pathname === '/servicios', 'compatibilidad servicios');
  check(frame.contentWindow.location.search === '?origen=antiguo', 'Se perdió query de enlace anterior');
  await navigate('/#reservar', 'Reservá tu turno');
  check(frame.contentWindow.location.pathname === '/reservar', 'Compatibilidad reserva no reemplazó URL');
  await navigate('/ruta-no-existe', 'Página no encontrada');
  check((await fetch('/ruta-no-existe', { headers: { accept: 'text/html' } })).status === 404, 'Ruta desconocida devuelve HTTP 200');
  await navigate('/admin/login', 'Ingresar');
  check(documentInFrame().querySelector('meta[name=robots]').content === 'noindex, follow', 'Login sin noindex inicial');
  await navigate('/admin/agenda', 'Ingresar');
  await waitFor(() => frame.contentWindow.location.pathname === '/admin/login', 'protección administrativa');
  document.getElementById('result').textContent = JSON.stringify({ passed: true });
}
run().catch((error) => { document.getElementById('result').textContent = JSON.stringify({ passed: false, error: error.message }); });
