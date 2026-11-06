import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const browser = process.env.UX_TEST_BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
test('navegador: rutas directas, recarga, atrás/adelante, hashes antiguos, 404 y login sin cambiar autenticación', { skip: !browser, timeout: 60000 }, async (t) => {
  const driver = readFileSync(new URL('./routes-browser-driver.jsx', import.meta.url), 'utf8');
  const siteFixture = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
  siteFixture.name = 'Negocio de integración';
  Object.assign(siteFixture.texts, { homeEyebrow: 'IDENTIDAD CONFIGURADA', homeIntro: 'Presentación configurada',
    servicesHeading: 'Servicios personalizados', barbersHeading: 'Equipo personalizado', bookingIntro: 'Reserva personalizada', tagline: 'Lema personalizado' });
  const catalogRequests = { services: 0, barbers: 0 };
  const server = await createServer({ configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)), server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'seo-test-fixtures', enforce: 'pre', load(id) {
      if (id.replace(/\\/g, '/').split('?')[0].endsWith('/site.config.json')) return JSON.stringify(siteFixture);
    }, transformIndexHtml: { order: 'post', handler(html, context) {
      const requestUrl = new URL(context.originalUrl || '/', 'http://localhost');
      const pathname = requestUrl.pathname;
      if (!['/', '/servicios', '/barberos'].includes(pathname)) return html;
      const catalog = { services: [{ id: 31, name: 'Servicio inicial SSR', description: 'Incluido en el HTML', price: '2345.00' }],
        barbers: [{ id: 41, name: 'Barbero inicial SSR', image: null }] };
      const json = requestUrl.searchParams.has('malformedCatalog')
        ? '{"services":[{"id":31}],"barbers":[]}'
        : JSON.stringify(catalog).replace(/</g, '\\u003c');
      const script = `<script id="seo-catalog" type="application/json">${json}</script>`;
      html = html.replace('<div id="seo-services-list" class="row g-3"></div>', '<div id="seo-services-list" class="row g-3"><div class="col-md-6 col-lg-4"><div class="card service-card"><div class="card-body"><div class="card-title h5">Servicio inicial SSR</div><div class="service-price">$2.345</div></div></div></div></div>');
      html = html.replace('<div id="seo-barbers-list" class="row g-3"></div>', '<div id="seo-barbers-list" class="row g-3"><div class="col-sm-6 col-lg-4"><div class="card barber-card"><div class="barber-placeholder"><span>B</span></div><div class="card-body"><div class="card-title h5">Barbero inicial SSR</div></div></div></div></div>');
      return html.replace('</div><!-- SEO_PRERENDER_END -->', `${script}</div><!-- SEO_PRERENDER_END -->`);
    } }, configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        if (req.url === '/__seo_driver') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<html><head><meta charset="utf-8"></head><body><iframe width="390" height="844"></iframe><pre id="result">RUNNING</pre><script src="/__seo_test.js"></script></body></html>'); }
        if (req.url === '/__seo_test.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); return res.end(driver); }
        if (req.url === '/__catalog_counts') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(catalogRequests)); }
        if (!req.url.startsWith('/api/')) return next();
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/api/auth/me') { res.statusCode = 401; return res.end('{"error":"No autenticado"}'); }
        if (req.method !== 'GET') { res.statusCode = 405; return res.end('{"error":"Solo lecturas simuladas"}'); }
        if (req.url.startsWith('/api/services')) { catalogRequests.services++; return res.end('[{"id":1,"active":true,"name":"Corte API","price":"1000.00"}]'); }
        if (req.url.startsWith('/api/barbers')) { catalogRequests.barbers++; return res.end('[{"id":1,"active":true,"name":"Ana API"}]'); }
        return res.end('{}');
      });
    } }] });
  await server.listen(); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  // Check headers and status on actual Vite responses, without executing JS.
  for (const route of ['/', '/servicios', '/barberos', '/contacto', '/reservar', '/admin/login', '/admin/agenda']) {
    const response = await fetch(base + route, { headers: { accept: 'text/html' } }); assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow', route);
    assert.match(await response.text(), /name="robots" content="noindex, follow"/);
  }
  const profile = await mkdtemp(path.join(tmpdir(), 'barberia-seo-browser-'));
  t.after(async () => { if (path.dirname(profile) === path.resolve(tmpdir()) && path.basename(profile).startsWith('barberia-seo-browser-')) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
  const child = spawn(browser, ['--headless', '--disable-gpu', '--disable-extensions', '--disable-features=BackForwardCache', '--no-first-run', `--user-data-dir=${profile}`, '--window-size=600,900', '--dump-dom', '--virtual-time-budget=25000', `${base}/__seo_driver`], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let html = ''; child.stdout.on('data', (chunk) => { html += chunk; });
  const timer = setTimeout(() => child.kill(), 40000);
  t.after(() => { clearTimeout(timer); if (child.exitCode === null) child.kill(); });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  clearTimeout(timer); assert.equal(code, 0);
  const output = html.match(/<pre id="result">(.*?)<\/pre>/s)?.[1];
  assert.ok(output && output !== 'RUNNING', 'El navegador no terminó el recorrido');
  const result = JSON.parse(output.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.equal(result.passed, true, result.error);
});
