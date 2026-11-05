import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { siteSeoPlugin } from '../seo-plugin.mjs';
import { validateSite, htmlForRoute, hairSalonSchema, robotsTxt, sitemapXml } from '../site-tools.mjs';
import { legacyDestination, routePolicy } from '../src/config/routes.js';

const example = JSON.parse(fs.readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
function realSite() {
  const site = structuredClone(example);
  Object.assign(site, { environment: 'production', indexable: true, isExample: false, name: 'Cortes del Barrio', description: 'Cortes de cabello y barba en Parque Patricios.',
    publicUrl: 'https://cortesdelbarrio.com', phone: '+54 11 4567 8900', whatsapp: '5491145678900', email: 'contacto@cortesdelbarrio.com', instagram: 'https://www.instagram.com/cortesdelbarrio/' });
  site.address = { street: 'Av. Caseros 2500', locality: 'Ciudad Autónoma de Buenos Aires', province: 'Ciudad Autónoma de Buenos Aires', postalCode: '1264', country: 'AR' };
  site.texts.homeEyebrow = 'BARBERÍA EN PARQUE PATRICIOS'; site.texts.contactIntro = 'Encontranos en Parque Patricios.';
  return site;
}
test('configuración de desarrollo claramente identificada y no indexable', () => {
  assert.equal(validateSite(example), example);
  assert.equal(example.isExample, true);
  assert.equal(example.indexable, false);
  assert.match(example.name, /DEMOSTRACIÓN/);
});
test('permite una instalación indexable completa y rechaza ejemplos aunque se cambien los indicadores', () => {
  assert.equal(validateSite(realSite()).indexable, true);
  const site = structuredClone(example);
  Object.assign(site, { environment: 'production', indexable: true, isExample: false, publicUrl: 'https://cortesdelbarrio.com' });
  assert.throws(() => validateSite(site), /bloqueada/);
});
test('publicación indexable exige datos reales, teléfono, dominio HTTPS y entorno de producción', () => {
  for (const change of [
    (site) => { site.isExample = true; }, (site) => { site.environment = 'staging'; },
    (site) => { site.phone = ''; }, (site) => { site.address.street = ''; },
    (site) => { site.publicUrl = 'http://cortesdelbarrio.com'; }, (site) => { site.publicUrl = 'https://localhost'; },
    (site) => { site.publicUrl = 'https://barberia.test'; }, (site) => { site.texts.contactIntro = 'Tu dirección de ejemplo'; },
  ]) { const site = realSite(); change(site); assert.throws(() => validateSite(site)); }
});
test('configuración pública rechaza campos ajenos, URLs peligrosas y posibles credenciales sin incluir valores en errores', () => {
  for (const change of [
    (site) => { site.password = 'not-a-real-password'; }, (site) => { site.texts.token = 'not-a-real-token'; },
    (site) => { site.logo = 'javascript:alert(1)'; }, (site) => { site.instagram = 'https://other.invalid/'; },
    (site) => { site.publicUrl = 'https://user:password@cortesdelbarrio.com'; },
    (site) => { site.description = 'ghp_' + 'fixtureonly'; },
  ]) { const site = realSite(); change(site); assert.throws(() => validateSite(site), (error) => !error.message.includes('fixtureonly')); }
});
test('solo cuatro rutas informativas pueden indexarse; reserva, administración y desconocidas nunca', () => {
  for (const route of ['/', '/servicios', '/barberos', '/contacto']) {
    assert.equal(routePolicy(route, true).robots, 'index, follow');
    assert.equal(routePolicy(route, false).robots, 'noindex, follow');
  }
  for (const route of ['/reservar', '/admin', '/admin/login', '/admin/agenda', '/no-existe']) assert.equal(routePolicy(route, true).robots, 'noindex, follow');
  assert.equal(routePolicy('/no-existe').status, 404);
  assert.equal(routePolicy('/servicios/').status, 200);
});
test('compatibilidad de hashes conserva query sin alterar anclas privadas ni rutas desconocidas', () => {
  assert.equal(legacyDestination('/', '#servicios'), '/servicios');
  assert.equal(legacyDestination('/', '#reservar', '?origen=web'), '/reservar?origen=web');
  assert.equal(legacyDestination('/', '#inicio'), '/');
  assert.equal(legacyDestination('/admin', '#report-collections'), null);
  assert.equal(legacyDestination('/no-existe', '#reservar'), null);
  assert.equal(legacyDestination('/', '#otro'), null);
});
test('cada ruta incluye contenido institucional, metadatos únicos y canonical en el HTML inicial', () => {
  const template = '<html><head><title>Inicial</title><meta name="description" content=""><meta name="robots" content="noindex"></head><body><div id="root"></div></body></html>';
  const site = realSite(); site.name = 'Cortes & <b>Barrio</b>';
  const routes = ['/', '/servicios', '/barberos', '/contacto'];
  const rendered = routes.map((route) => htmlForRoute(template, route, site, true));
  const home = rendered[0];
  assert.match(home, /Inicio \| Cortes &amp; &lt;b&gt;Barrio&lt;\/b&gt;/);
  assert.match(home, /name="robots" content="index, follow"/);
  assert.equal((home.match(/name="robots"/g) || []).length, 1);
  assert.match(home, /id="seo-prerender"[\s\S]*<h1>/);
  assert.match(home, /rel="canonical" href="https:\/\/cortesdelbarrio\.com\/"/);
  assert.equal(new Set(rendered.map((html) => html.match(/<title>(.*?)<\/title>/)[1])).size, 4);
  assert.equal(new Set(rendered.map((html) => html.match(/name="description" content="(.*?)"/)[1])).size, 4);
  assert.match(rendered[1], /<h1>Servicios<\/h1>/);
  assert.match(rendered[2], /<h1>Nuestros barberos<\/h1>/);
  assert.match(rendered[3], /application\/ld\+json/);
  assert.match(rendered[3], /addressLocality/);
  assert.match(rendered[3], /postalCode/);
  assert.match(htmlForRoute(template, '/admin/login', site, true), /content="noindex, follow"/);
  assert.match(htmlForRoute(template, '/reservar', site, true), /content="noindex, follow"/);
  assert.doesNotMatch(htmlForRoute(template, '/admin/login', site, true), /rel="canonical"/);
  assert.equal((htmlForRoute(template, '/reservar', site, true).match(/rel="canonical"/g) || []).length, 1);
});
test('al regenerar cada shell reemplaza el bloque prerenderizado completo aunque contenga divs anidados', () => {
  const template = '<html><head><title>Inicial</title><meta name="description" content=""></head><body><div id="root"></div></body></html>';
  const site = realSite();
  const home = htmlForRoute(template, '/', site, true);
  const services = htmlForRoute(home, '/servicios', site, true);
  const barbers = htmlForRoute(home, '/barberos', site, true);
  const contact = htmlForRoute(home, '/contacto', site, true);
  const booking = htmlForRoute(home, '/reservar', site, true);
  const admin = htmlForRoute(home, '/admin/login', site, true);
  assert.match(services, /Un buen corte empieza con el servicio indicado/);
  assert.doesNotMatch(services, /homeTitle|Tu estilo|barbersIntro|Personas apasionadas|seo-barbers-list/);
  assert.match(barbers, /Personas apasionadas por el oficio/);
  assert.doesNotMatch(barbers, /Tu estilo|servicesIntro|Un buen corte empieza/);
  assert.match(contact, /Encontranos en Parque Patricios/);
  assert.doesNotMatch(contact, /Tu estilo|Personas apasionadas|seo-services-list|seo-barbers-list/);
  for (const shell of [booking, admin]) assert.doesNotMatch(shell, /SEO_PRERENDER|seo-prerender|Tu estilo|Personas apasionadas|Un buen corte empieza/);
  assert.throws(() => htmlForRoute(home.replace('<!-- SEO_PRERENDER_END -->', ''), '/contacto', site, true), /marcadores/);
});
test('schema omite datos no configurados o de ejemplo; sitemap y robots respetan la política', () => {
  const site = realSite();
  site.phone = ''; site.address.street = ''; site.address.locality = ''; site.address.province = ''; site.address.postalCode = ''; site.address.country = '';
  site.instagram = ''; site.email = ''; site.logo = '';
  const schema = hairSalonSchema(site);
  assert.equal(schema.telephone, undefined);
  assert.equal(schema.address, undefined);
  assert.equal(schema.sameAs, undefined);
  assert.equal(hairSalonSchema(example), null);
  const sitemap = sitemapXml(realSite(), true);
  assert.equal((sitemap.match(/<url>/g) || []).length, 4);
  assert.doesNotMatch(sitemap, /reservar|admin|no-existe/);
  assert.match(sitemap, /https:\/\/cortesdelbarrio\.com\/contacto/);
  assert.doesNotMatch(sitemapXml(realSite(), false), /<url>/);
  assert.match(robotsTxt(realSite()), /Sitemap: https:\/\/cortesdelbarrio\.com\/sitemap\.xml/);
  assert.match(robotsTxt(realSite()), /Allow: \/\n/);
  assert.doesNotMatch(robotsTxt(realSite()), /Disallow/);
});
test('build indexable genera HTML informativo indexable y shells privados noindex, sin un noindex global accidental', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'barberia-site-build-'));
  t.after(() => { if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('barberia-site-build-')) fs.rmSync(directory, { recursive: true, force: true }); });
  const output = path.join(directory, 'dist'); fs.mkdirSync(output);
  const plugin = siteSeoPlugin(realSite());
  plugin.configResolved({ root: directory, build: { outDir: 'dist' }, command: 'build', mode: 'production' });
  const html = '<html><head><title>Inicial</title><meta name="description" content=""></head><body><div id="root"></div></body></html>';
  fs.writeFileSync(path.join(output, 'index.html'), plugin.transformIndexHtml(html, {}));
  plugin.closeBundle();
  for (const file of ['index.html', 'servicios/index.html', 'barberos/index.html', 'contacto/index.html']) {
    const page = fs.readFileSync(path.join(output, file), 'utf8');
    assert.match(page, /content="index, follow"/);
    assert.match(page, /id="seo-prerender"/);
    assert.match(page, /rel="canonical"/);
  }
  const servicesPage = fs.readFileSync(path.join(output, 'servicios/index.html'), 'utf8');
  const barbersPage = fs.readFileSync(path.join(output, 'barberos/index.html'), 'utf8');
  const contactPage = fs.readFileSync(path.join(output, 'contacto/index.html'), 'utf8');
  assert.doesNotMatch(servicesPage, /Personas apasionadas|seo-barbers-list|Tu estilo/);
  assert.doesNotMatch(barbersPage, /Un buen corte empieza|seo-services-list|Tu estilo/);
  assert.doesNotMatch(contactPage, /Personas apasionadas|Un buen corte empieza|seo-services-list|seo-barbers-list/);
  for (const file of ['admin/index.html', 'reservar/index.html', '404.html']) {
    const page = fs.readFileSync(path.join(output, file), 'utf8');
    assert.match(page, /content="noindex, follow"/);
    assert.doesNotMatch(page, /SEO_PRERENDER|seo-prerender|Personas apasionadas|Un buen corte empieza/);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'site-policy.json'), 'utf8')).indexable, true);
  assert.match(servicesPage, /<h1>Servicios<\/h1>/);
  assert.equal((fs.readFileSync(path.join(output, 'sitemap.xml'), 'utf8').match(/<url>/g) || []).length, 4);
  assert.match(fs.readFileSync(path.join(output, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/cortesdelbarrio\.com\/sitemap\.xml/);
  const existingBuild = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  const devPlugin = siteSeoPlugin(example);
  devPlugin.configResolved({ root: directory, build: { outDir: 'dist' }, command: 'serve', mode: 'development' });
  devPlugin.closeBundle();
  assert.equal(fs.readFileSync(path.join(output, 'index.html'), 'utf8'), existingBuild, 'Cerrar Vite dev no debe reescribir un build indexable');
});
