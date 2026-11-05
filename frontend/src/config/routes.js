export const publicRoutes = {
  '/': { title: 'Inicio', descriptionKey: 'seoHomeDescription', indexable: true },
  '/servicios': { title: 'Servicios', descriptionKey: 'seoServicesDescription', indexable: true },
  '/barberos': { title: 'Barberos', descriptionKey: 'seoBarbersDescription', indexable: true },
  '/contacto': { title: 'Contacto', descriptionKey: 'seoContactDescription', indexable: true },
  '/reservar': { title: 'Reservar turno', descriptionKey: 'bookingIntro', indexable: false },
};

export function normalizePath(pathname) { return pathname.replace(/\/+$/, '') || '/'; }
export function isAdminPath(pathname) { return pathname === '/admin' || pathname.startsWith('/admin/'); }
export function routePolicy(pathname, indexable = false) {
  const path = normalizePath(pathname);
  const page = publicRoutes[path];
  return { path, status: page || isAdminPath(path) ? 200 : 404,
    title: page?.title || (isAdminPath(path) ? 'Administración' : 'Página no encontrada'),
    robots: indexable && page?.indexable ? 'index, follow' : 'noindex, follow',
    descriptionKey: page?.descriptionKey,
    file: isAdminPath(path) ? 'admin/index.html' : page ? (path === '/' ? 'index.html' : `${path.slice(1)}/index.html`) : '404.html' };
}

export function legacyDestination(pathname, hash, search = '') {
  if (pathname !== '/') return null;
  const key = hash.slice(1).split('?')[0];
  const aliases = { inicio: '/', servicios: '/servicios', 'servicios-lista': '/servicios', barberos: '/barberos', 'barberos-lista': '/barberos', contacto: '/contacto', reservar: '/reservar' };
  return Object.hasOwn(aliases, key) ? `${aliases[key]}${search}` : null;
}
