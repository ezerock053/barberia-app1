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
  const homeServices = documentInFrame().querySelector('#servicios-lista');
  const homeBarbers = documentInFrame().querySelector('#barberos-lista');
  check(homeServices?.textContent.includes('Servicio inicial SSR'), `La portada no conserva el catálogo inicial del HTML: ${home}`);
  check(homeServices?.textContent.includes('$2.345'), 'El precio inicial del HTML no llega a React');
  check(homeBarbers?.textContent.includes('Barbero inicial SSR'), 'La portada no conserva los barberos iniciales del HTML');
  const homePortrait = homeBarbers?.querySelector('img');
  check(homePortrait?.loading === 'lazy' && homePortrait.decoding === 'async', 'El retrato de portada no usa carga diferida y decodificación asíncrona');
  check(homePortrait.getAttribute('width') === '640' && homePortrait.getAttribute('height') === '480', 'El retrato de portada no reserva dimensiones');
  let catalogRequests = await (await fetch('/__catalog_counts')).json();
  check(catalogRequests.services === 0 && catalogRequests.barbers === 0, 'La portada vuelve a consultar un catálogo ya presente en el HTML');
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
  check(documentInFrame().querySelector('.service-card').textContent.includes('Servicio inicial SSR'), 'Servicios pierde el catálogo al montar React');
  catalogRequests = await (await fetch('/__catalog_counts')).json();
  check(catalogRequests.services === 0, 'Servicios consulta la API aunque ya recibió el catálogo inicial');
  await navigate('/contacto', 'Contacto');
  check(documentInFrame().querySelector('main').textContent.includes('Dirección de ejemplo'), 'Contacto no usa configuración');
  await new Promise((resolve) => { frame.addEventListener('load', resolve, { once: true }); frame.contentWindow.location.reload(); });
  await waitFor(() => documentInFrame().querySelector('h1')?.textContent === 'Contacto', 'recarga directa');
  await navigate('/barberos', 'Nuestros barberos');
  check(documentInFrame().querySelector('.barber-card').textContent.includes('Barbero inicial SSR'), 'Barberos pierde el catálogo al montar React');
  const firstPublicPortrait = documentInFrame().querySelector('.barber-card img');
  check(firstPublicPortrait?.loading === 'eager' && firstPublicPortrait.fetchPriority === 'high', 'La primera foto visible del equipo no es prioritaria');
  check(firstPublicPortrait.decoding === 'async' && firstPublicPortrait.getAttribute('width') === '640' && firstPublicPortrait.getAttribute('height') === '480',
    'La primera foto del equipo no tiene decodificación y dimensiones explícitas');
  check(firstPublicPortrait.alt === 'Barbero inicial SSR', 'Se perdió el texto alternativo del retrato');
  catalogRequests = await (await fetch('/__catalog_counts')).json();
  check(catalogRequests.barbers === 0, 'Barberos consulta la API aunque ya recibió el catálogo inicial');
  await navigate('/reservar', 'Reservá tu turno');
  check(documentInFrame().querySelector('.page-intro').textContent === 'Reserva personalizada', 'Reserva no usa texto configurado');
  await waitFor(() => documentInFrame().querySelector('#service-1'), 'catálogo de reserva vía API');
  documentInFrame().querySelector('#service-1').click();
  await waitFor(() => !documentInFrame().querySelector('button.btn-warning')?.disabled, 'selección de servicio');
  documentInFrame().querySelector('button.btn-warning').click();
  await waitFor(() => documentInFrame().querySelector('#barber-1'), 'paso de selección de barbero');
  const bookingPortrait = documentInFrame().querySelector('.barber-choice-avatar img');
  check(bookingPortrait?.loading === 'lazy' && bookingPortrait.decoding === 'async', 'El retrato de reserva no se difiere');
  check(bookingPortrait.getAttribute('width') === '80' && bookingPortrait.getAttribute('height') === '80' && bookingPortrait.alt === '', 'El avatar de reserva no reserva su espacio o perdió su semántica decorativa');
  catalogRequests = await (await fetch('/__catalog_counts')).json();
  check(catalogRequests.services > 0 && catalogRequests.barbers > 0, 'La reserva dejó de consultar la API cuando no tiene catálogo inicial');
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
  await navigate('/servicios?malformedCatalog=1', 'Servicios');
  await waitFor(() => documentInFrame().querySelector('.service-card')?.textContent.includes('Corte API'), 'fallback API para JSON incompleto');
  check(!documentInFrame().querySelector('.service-card').textContent.includes('Servicio inicial SSR'), 'invalid catalog is not rendered partially');
  catalogRequests = await (await fetch('/__catalog_counts')).json();
  check(catalogRequests.services > 0, 'valid but incomplete JSON activates API fallback');
  document.getElementById('result').textContent = JSON.stringify({ passed: true });
}
run().catch((error) => { document.getElementById('result').textContent = JSON.stringify({ passed: false, error: error.message }); });
