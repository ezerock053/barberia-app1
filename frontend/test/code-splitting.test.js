import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'vite';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.dirname(frontendRoot);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
};

function browserPath() {
  const candidates = [
    process.env.UX_TEST_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

test('production admin routes lazy-load modules by route and recover from a failed chunk', { timeout: 180_000 }, async (t) => {
  const browser = browserPath();
  assert.ok(browser, 'A local Chrome/Edge/Chromium browser is required for production route verification');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'barberia-code-split-'));
  const distDir = path.join(tempRoot, 'dist');
  const profileDir = path.join(tempRoot, 'browser-profile');
  let failAgendaOnce = false;
  const chunkResponses = [];
  let server;
  let browserProcess;

  t.after(async () => {
    if (browserProcess && browserProcess.exitCode === null) browserProcess.kill();
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  await build({
    root: frontendRoot,
    configFile: path.join(frontendRoot, 'vite.config.js'),
    build: { outDir: distDir, emptyOutDir: true },
  });

  const driverPath = path.join(frontendRoot, 'test-fixtures', 'code-splitting-driver.js');
  const clientBootstrap = `
    const role = new URL(location.href).searchParams.get('__role') || sessionStorage.getItem('testRole') || 'anonymous';
    sessionStorage.setItem('testRole', role);
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname === '/api/auth/me') {
        return role === 'anonymous'
          ? new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
          : new Response(JSON.stringify({ admin: { id: 1, email: 'test@example.invalid', role } }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/appointments') return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
      if (url.pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ totals: { collected: 0, collectedCount: 0, completedCount: 0, completedValue: 0, outstandingValue: 0, outstandingCount: 0, byMethod: {} }, collections: [], services: [], barbers: [], historical: { completedWithoutDate: 0, paidWithoutCharge: 0 } }), { headers: { 'Content-Type': 'application/json' } });
      }
      return nativeFetch(input, init);
    };
  `;

  server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    if (requestUrl.pathname === '/__driver.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      fs.createReadStream(driverPath).pipe(response);
      return;
    }
    if (requestUrl.pathname === '/__fail-agenda-once') {
      failAgendaOnce = true;
      response.writeHead(204).end();
      return;
    }

    let target;
    if (requestUrl.pathname === '/__driver') target = null;
    else if (requestUrl.pathname.startsWith('/assets/')) target = path.join(distDir, requestUrl.pathname.slice(1));
    else if (requestUrl.pathname === '/admin' || requestUrl.pathname.startsWith('/admin/')) target = path.join(distDir, 'admin', 'index.html');
    else if (requestUrl.pathname === '/') target = path.join(distDir, 'index.html');
    else {
      const routeFile = path.join(distDir, decodeURIComponent(requestUrl.pathname).replace(/^\/+/, ''), 'index.html');
      target = fs.existsSync(routeFile) ? routeFile : path.join(distDir, '404.html');
    }

    if (requestUrl.pathname === '/__driver') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><body><pre id="result">RUNNING</pre><iframe></iframe><script src="/__driver.js"></script></body></html>');
      return;
    }
    if (target.startsWith(distDir) === false || !fs.existsSync(target)) {
      response.writeHead(404).end('Not found');
      return;
    }
    if (failAgendaOnce && /\/assets\/MyAgendaPage-[^/]+\.js$/.test(requestUrl.pathname)) {
      failAgendaOnce = false;
      chunkResponses.push({ path: requestUrl.pathname, status: 503 });
      response.writeHead(503, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Temporary chunk failure');
      return;
    }

    const contentType = mimeTypes[path.extname(target)] || 'application/octet-stream';
    if (requestUrl.pathname.endsWith('.js')) chunkResponses.push({ path: requestUrl.pathname, status: 200 });
    response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    if (path.extname(target) === '.html') {
      const html = fs.readFileSync(target, 'utf8').replace('</head>', `<script>${clientBootstrap}</script></head>`);
      response.end(html);
    } else fs.createReadStream(target).pipe(response);
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
    `--user-data-dir=${profileDir}`, '--dump-dom', '--virtual-time-budget=60000', `${baseUrl}/__driver`,
  ];
  browserProcess = spawn(browser, args, { cwd: projectRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  browserProcess.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  browserProcess.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const exitPromise = once(browserProcess, 'close');
  const timeout = setTimeout(() => browserProcess.kill(), 150_000);
  const [exitCode] = await exitPromise;
  clearTimeout(timeout);
  assert.equal(exitCode, 0, `Browser exited unsuccessfully: ${stderr.slice(-3000)}`);
  const resultMatch = stdout.match(/<pre id="result">([^<]+)<\/pre>/);
  assert.ok(resultMatch, `Browser test driver did not produce a result: ${stdout.slice(-3000)} ${stderr.slice(-1000)}`);
  const result = JSON.parse(resultMatch[1]);
  assert.equal(result.passed, true, JSON.stringify({ ...result, agendaChunkResponses: chunkResponses.filter((entry) => entry.path.includes('MyAgendaPage')) }));
});
