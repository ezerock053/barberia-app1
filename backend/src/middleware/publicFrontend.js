'use strict';
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

// Optional production host for the existing SPA. No React rendering takes place.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function renderServices(services = []) {
  if (!services.length) return '<p class="muted-copy">Pronto vas a encontrar nuestros servicios acá.</p>';
  return services.map((service) => {
    const price = Number(service.price);
    const displayPrice = Number.isFinite(price) ? price.toLocaleString('es-AR') : escapeHtml(service.price);
    const description = service.description || 'Un servicio pensado para que salgas impecable.';
    return `<div class="col-md-6 col-lg-4"><div class="card service-card h-100"><div class="card-body"><div class="service-symbol" aria-hidden="true">✦</div><div class="card-title h5">${escapeHtml(service.name)}</div><p class="card-text">${escapeHtml(description)}</p><div class="service-price">$${displayPrice}</div></div></div></div>`;
  }).join('');
}

function safeImage(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const image = value.trim();
  if (image.startsWith('/') && !image.startsWith('//')) return image;
  try {
    const url = new URL(image);
    return url.protocol === 'https:' && !url.username && !url.password ? image : null;
  } catch { return null; }
}

function renderBarbers(barbers = [], { prioritizeFirstImage = false } = {}) {
  if (!barbers.length) return '<p class="muted-copy">Pronto vas a conocer a nuestro equipo.</p>';
  return barbers.map((barber, index) => {
    const name = escapeHtml(barber.name);
    const image = safeImage(barber.image);
    const priority = prioritizeFirstImage && index === 0;
    const portrait = image
      ? `<img class="card-img-top" src="${escapeHtml(image)}" alt="${name}" width="640" height="480" loading="${priority ? 'eager' : 'lazy'}" decoding="async"${priority ? ' fetchpriority="high"' : ''} />`
      : `<div class="barber-placeholder" aria-label="Retrato no disponible"><span>${escapeHtml(name.charAt(0).toUpperCase() || 'B')}</span></div>`;
    return `<div class="col-sm-6 col-lg-4"><div class="card barber-card h-100">${portrait}<div class="card-body"><div class="eyebrow">BARBERO</div><div class="card-title h5">${name}</div></div></div></div>`;
  }).join('');
}

function serializeCatalog(catalog) {
  // A JSON script element is still parsed as HTML up to its closing tag. Escape
  // HTML-significant characters so catalog text can never end the element.
  return JSON.stringify(catalog).replace(/[<>&\u2028\u2029]/g, (character) => ({
    '<': '\\u003c', '>': '\\u003e', '&': '\\u0026',
    '\u2028': '\\u2028', '\u2029': '\\u2029',
  })[character]);
}

function addCatalogToHtml(html, pathname, catalog) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const services = Array.isArray(catalog?.services) ? catalog.services : [];
  const barbers = Array.isArray(catalog?.barbers) ? catalog.barbers : [];
  const pageServices = path === '/' ? services.slice(0, 3) : services;
  const pageBarbers = path === '/' ? barbers.slice(0, 3) : barbers;
  if (path === '/' || path === '/servicios') html = html.replace('<div id="seo-services-list" class="row g-3"></div>', `<div id="seo-services-list" class="row g-3">${renderServices(pageServices)}</div>`);
  if (path === '/' || path === '/barberos') html = html.replace('<div id="seo-barbers-list" class="row g-3"></div>', `<div id="seo-barbers-list" class="row g-3">${renderBarbers(pageBarbers, { prioritizeFirstImage: path === '/barberos' })}</div>`);
  const initialCatalog = {
    services: pageServices.map((service) => ({
      id: service.id, name: String(service.name ?? ''), description: String(service.description ?? ''), price: service.price,
    })),
    barbers: pageBarbers.map((barber) => ({
      id: barber.id, name: String(barber.name ?? ''), image: safeImage(barber.image),
    })),
  };
  const script = `<script id="seo-catalog" type="application/json">${serializeCatalog(initialCatalog)}</script>`;
  html = html.replace('</div><!-- SEO_PRERENDER_END -->', `${script}</div><!-- SEO_PRERENDER_END -->`);
  return html;
}

function createPublicFrontend(directory, { loadCatalog } = {}) {
  const root = path.resolve(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'site-policy.json'), 'utf8'));
  const allowed = ['/', '/servicios', '/barberos', '/contacto', '/reservar'];
  if (manifest.version !== 1 || typeof manifest.indexable !== 'boolean' || !manifest.routes
    || Object.keys(manifest.routes).length !== allowed.length || allowed.some((key) => !manifest.routes[key])) throw new Error('Build de frontend incompleto: ejecutar vite build.');
  const router = express.Router();
  const assets = express.static(root, { index: false, redirect: false });
  router.use((req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/') || req.path === '/health') return next();
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    // Only serve non-HTML assets here: HTML needs the route-specific policy.
    if (!/\.html$/i.test(req.path) && req.path !== '/site-policy.json') return assets(req, res, next);
    return next();
  });
  router.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || req.path === '/api' || req.path.startsWith('/api/') || req.path === '/health') return next();
    const pathname = req.path.replace(/\/+$/, '') || '/';
    const admin = pathname === '/admin' || pathname.startsWith('/admin/');
    const page = manifest.routes[pathname];
    const found = Boolean(page || admin);
    const indexable = manifest.indexable && Boolean(page) && pathname !== '/reservar';
    const relative = admin ? 'admin/index.html' : page ? (pathname === '/' ? 'index.html' : `${pathname.slice(1)}/index.html`) : '404.html';
    res.set('X-Robots-Tag', indexable ? 'index, follow' : 'noindex, follow');
    res.set('Cache-Control', 'no-cache');
    if (found && typeof loadCatalog === 'function' && ['/', '/servicios', '/barberos'].includes(pathname)) {
      return fs.promises.readFile(path.join(root, relative), 'utf8').then(async (html) => {
        try { html = addCatalogToHtml(html, pathname, await loadCatalog()); } catch { /* Keep the public shell usable if a catalog read fails. */ }
        res.type('html');
        return res.status(200).send(html);
      }).catch(next);
    }
    return res.status(found ? 200 : 404).sendFile(path.join(root, relative));
  });
  return router;
}
module.exports = { createPublicFrontend, addCatalogToHtml };
