export function safeAdminReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/admin') || value.startsWith('//') || value.includes('\\')) {
    return '/admin';
  }

  try {
    const target = new URL(value, window.location.origin);
    const isAdminPath = target.pathname === '/admin' || target.pathname.startsWith('/admin/');
    if (target.origin !== window.location.origin || !isAdminPath || target.pathname === '/admin/login') return '/admin';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/admin';
  }
}

export function adminLoginHref(returnTo) {
  return `/admin/login?redirect=${encodeURIComponent(safeAdminReturnTo(returnTo))}`;
}

export function currentAdminDestination() {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/admin';
  const current = `${pathname}${window.location.search}${window.location.hash}`;
  if (pathname === '/admin/login') {
    return safeAdminReturnTo(new URLSearchParams(window.location.search).get('redirect'));
  }
  return safeAdminReturnTo(current);
}
