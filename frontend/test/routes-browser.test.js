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
  const server = await createServer({ configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)), server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'seo-test-fixtures', enforce: 'pre', load(id) {
      if (id.replace(/\\/g, '/').split('?')[0].endsWith('/site.config.json')) return JSON.stringify(siteFixture);
    }, configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        if (req.url === '/__seo_driver') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<html><head><meta charset="utf-8"></head><body><iframe width="390" height="844"></iframe><pre id="result">RUNNING</pre><script src="/__seo_test.js"></script></body></html>'); }
        if (req.url === '/__seo_test.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); return res.end(driver); }
        if (!req.url.startsWith('/api/')) return next();
        res.setHeader('Content-Type', 'application/json');
        if (req.url === '/api/auth/me') { res.statusCode = 401; return res.end('{"error":"No autenticado"}'); }
        if (req.method !== 'GET') { res.statusCode = 405; return res.end('{"error":"Solo lecturas simuladas"}'); }
        return res.end(req.url.startsWith('/api/services') ? '[{"id":1,"active":true,"name":"Corte","price":"1000.00"}]' : '[{"id":1,"active":true,"name":"Ana"}]');
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
