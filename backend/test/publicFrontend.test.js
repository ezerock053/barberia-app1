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
    services: [{ id: revision, name: `Corte <script>nuevo</script> ${revision}`, description: 'Precio vigente & claro', price: `${revision++}000` }],
    barbers: [{ id: revision, name: 'Ana </script><script>alert(1)</script>', image: 'javascript:alert(1)' }],
  }));
  const first = await (await fetch(base + '/servicios')).text();
  assert.match(first, /Corte &lt;script&gt;nuevo&lt;\/script&gt;/);
  assert.match(first, /Precio vigente &amp; claro/);
  assert.match(first, /\$1\.000/);
  assert.doesNotMatch(first, /<script>nuevo/);
  const initial = JSON.parse(first.match(/<script id="seo-catalog" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(initial.services[0], { id: 1, name: 'Corte <script>nuevo</script> 1', description: 'Precio vigente & claro', price: '1000' });
  assert.equal(initial.barbers[0].name, 'Ana </script><script>alert(1)</script>');
  assert.equal(initial.barbers[0].image, null, 'El origen de imagen inseguro no llega al estado inicial de React');
  assert.doesNotMatch(first, /<script>alert\(1\)<\/script>/, 'El nombre no puede cerrar el script JSON ni ejecutar HTML');
  const second = await (await fetch(base + '/servicios')).text();
  assert.match(second, /\$2\.000/, 'cada respuesta consulta un catálogo actualizado');
  const updated = JSON.parse(second.match(/<script id="seo-catalog" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(updated.services[0].id, 2);
  assert.equal(updated.services[0].name, 'Corte <script>nuevo</script> 2');
  assert.equal(updated.services[0].price, '2000', 'la nueva solicitud incluye el precio actual');
  const barbers = await (await fetch(base + '/barberos')).text();
  assert.match(barbers, /Ana &lt;\/script&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(barbers, /src="javascript:/);
  assert.match(barbers, /Retrato no disponible/);
  const barberCatalog = JSON.parse(barbers.match(/<script id="seo-catalog" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(barberCatalog.barbers[0].id, 4);
  assert.equal(barberCatalog.barbers[0].name, 'Ana </script><script>alert(1)</script>');
  const updatedBarbers = await (await fetch(base + '/barberos')).text();
  const nextBarberCatalog = JSON.parse(updatedBarbers.match(/<script id="seo-catalog" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(nextBarberCatalog.barbers[0].id, 5, 'una nueva solicitud entrega la versión actual del equipo');
  const home = await (await fetch(base + '/')).text();
  assert.match(home, /id="seo-services-list"/);
  assert.match(home, /id="seo-barbers-list"/);
  assert.equal((home.match(/id="seo-catalog"/g) || []).length, 1);
});
test('serialización conserva comillas, barras, saltos, separadores Unicode y texto de cierre script', async (t) => {
  const special = `single ' and double " quote, slash \\ and newline\nseparator\u2028middle\u2029end </script><script>alert(1)</script>`;
  const base = await harness(t, true, async () => ({
    services: [{ id: 1, name: special, description: special, price: '2500.00' }],
    barbers: [{ id: 2, name: special, image: '/uploads/photo.webp' }],
  }));
  const html = await (await fetch(base + '/servicios')).text();
  const block = html.match(/<script id="seo-catalog" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(block, 'el JSON permanece dentro de su elemento script');
  assert.doesNotMatch(block, /[<>&\u2028\u2029]/, 'los caracteres significativos no quedan crudos en el HTML');
  const catalog = JSON.parse(block);
  assert.equal(catalog.services[0].name, special);
  assert.equal(catalog.services[0].description, special);
  assert.equal(catalog.barbers[0].name, special);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/, 'texto de catálogo no crea un script ejecutable');
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
