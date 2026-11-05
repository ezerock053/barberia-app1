'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createPublicFrontend } = require('../src/middleware/publicFrontend');

async function harness(t, indexable, loadCatalog) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'barberia-seo-'));
  t.after(async () => { if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('barberia-seo-')) await fs.rm(root, { recursive: true, force: true }); });
  const { routePolicy, publicRoutes } = await import('../../frontend/src/config/routes.js');
  const { htmlForRoute, robotsTxt, sitemapXml } = await import('../../frontend/site-tools.mjs');
  const template = '<html><head><title>Inicial</title><meta name="description" content=""></head><body><div id="root"></div></body></html>';
  const site = JSON.parse(await fs.readFile(path.join(__dirname, '../../frontend/site.config.json'), 'utf8'));
  site.name = 'Negocio de prueba'; site.description = 'Contenido público de prueba'; site.publicUrl = 'https://test.example';
  for (const route of [...Object.keys(publicRoutes), '/admin', '/not-found']) {
    const policy = routePolicy(route, indexable); const file = path.join(root, policy.file);
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, htmlForRoute(template, route, site, indexable));
  }
  await fs.writeFile(path.join(root, 'site-policy.json'), JSON.stringify({ version: 1, indexable, routes: Object.fromEntries(Object.keys(publicRoutes).map((route) => [route, routePolicy(route, indexable)])) }));
  await fs.writeFile(path.join(root, 'robots.txt'), robotsTxt(site));
  await fs.writeFile(path.join(root, 'sitemap.xml'), sitemapXml(site, indexable));
  const app = express(); app.use(createPublicFrontend(root, { loadCatalog }));
  app.get('/api/test', (_req, res) => res.json({ api: true }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
test('servidor entrega rutas públicas directas con HTML y política inicial correcta sin JavaScript', async (t) => {
  const base = await harness(t, true);
  for (const route of ['/', '/servicios', '/barberos', '/contacto', '/servicios/']) {
    const response = await fetch(base + route); assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), 'index, follow');
    assert.match(await response.text(), /name="robots" content="index, follow"/);
  }
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Sitemap: https:\/\/test\.example\/sitemap\.xml/);
  assert.equal((await (await fetch(base + '/sitemap.xml')).text()).match(/<url>/g)?.length, 4);
});
test('catálogo activo se inserta por solicitud en el HTML inicial y se escapa como texto seguro', async (t) => {
  let revision = 1;
  const base = await harness(t, true, async () => ({
    services: [{ name: 'Corte <script>nuevo</script>', description: 'Precio vigente & claro', price: `${revision++}000` }],
    barbers: [{ name: 'Ana <Barbera>', image: 'javascript:alert(1)' }],
  }));
  const first = await (await fetch(base + '/servicios')).text();
  assert.match(first, /Corte &lt;script&gt;nuevo&lt;\/script&gt;/);
  assert.match(first, /Precio vigente &amp; claro/);
  assert.match(first, /\$1\.000/);
  assert.doesNotMatch(first, /<script>nuevo/);
  const second = await (await fetch(base + '/servicios')).text();
  assert.match(second, /\$2\.000/, 'cada respuesta consulta un catálogo actualizado');
  const barbers = await (await fetch(base + '/barberos')).text();
  assert.match(barbers, /Ana &lt;Barbera&gt;/);
  assert.doesNotMatch(barbers, /src="javascript:/);
  assert.match(barbers, /Retrato no disponible/);
  const home = await (await fetch(base + '/')).text();
  assert.match(home, /id="seo-services-list"/);
  assert.match(home, /id="seo-barbers-list"/);
});
test('reserva y todas las rutas administrativas reciben noindex inicial aunque el negocio sea indexable', async (t) => {
  const base = await harness(t, true);
  for (const route of ['/reservar', '/admin', '/admin/login?redirect=%2Fadmin%2Fagenda', '/admin/agenda']) {
    const response = await fetch(base + route); assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
    assert.match(await response.text(), /name="robots" content="noindex, follow"/);
  }
});
test('rutas inexistentes devuelven 404 noindex y endpoints API no reciben el fallback de React', async (t) => {
  const base = await harness(t, true);
  for (const route of ['/inventada', '/otro.html', '/site-policy.json']) {
    const response = await fetch(base + route); assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
  }
  assert.deepEqual(await (await fetch(base + '/api/test')).json(), { api: true });
  assert.equal((await fetch(base + '/api/inexistente')).status, 404);
});
test('instalación no indexable conserva noindex en todas sus páginas', async (t) => {
  const base = await harness(t, false);
  for (const route of ['/', '/servicios', '/reservar', '/admin/login']) assert.equal((await fetch(base + route)).headers.get('x-robots-tag'), 'noindex, follow');
});
