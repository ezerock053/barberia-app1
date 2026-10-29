import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const browser = process.env.UX_TEST_BROWSER || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].find((candidate) => existsSync(candidate));

for (const width of [390, 360]) {
  test(`recorridos UX reales en navegador móvil de ${width}px`, { skip: !browser, timeout: 45000 }, async (t) => {
    const output = await build({ entryPoints: [fileURLToPath(new URL('./browser-scenarios.jsx', import.meta.url))],
      bundle: true, write: false, outdir: 'virtual', format: 'iife', define: { 'import.meta.env': '{}' }, jsx: 'automatic' });
    const script = output.outputFiles.find((file) => file.path.endsWith('.js')).text;
    const css = output.outputFiles.find((file) => file.path.endsWith('.css')).text;
    const server = createServer((req, res) => {
      if (req.url === '/test.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); }
      else if (req.url === '/test.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
      // Desktop Edge enforces a minimum outer window width. A same-origin frame
      // gives CSS and React the exact mobile viewport without any emulation library.
      else if (req.url === '/') { res.end(`<!doctype html><html><body style="margin:0"><iframe src="/frame" width="${width}" height="844" style="border:0"></iframe><pre id="result">RUNNING</pre><script>addEventListener('message',event=>{if(event.origin===location.origin&&event.source===document.querySelector('iframe').contentWindow)document.getElementById('result').textContent=JSON.stringify(event.data);});</script></body></html>`); }
      else { res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/test.css"></head><body class="admin-shell"><main id="root" class="container py-3"></main><pre id="result">RUNNING</pre><script src="/test.js"></script></body></html>'); }
    }).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const profile = await mkdtemp(path.join(tmpdir(), 'barberia-ux-'));
    t.after(async () => {
      // Only remove the unique temporary browser profile created by this test.
      if (path.dirname(path.resolve(profile)) === path.resolve(tmpdir()) && path.basename(profile).startsWith('barberia-ux-')) {
        await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      }
    });
    const child = spawn(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${profile}`, `--window-size=${width},844`, '--dump-dom', '--virtual-time-budget=12000',
      `http://127.0.0.1:${server.address().port}/`], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let html = '';
    child.stdout.on('data', (chunk) => { html += chunk; });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, 0, 'El navegador no completó la prueba');
    const result = html.match(/<pre id="result">(.*?)<\/pre>/s)?.[1];
    assert.ok(result && result !== 'RUNNING', 'El navegador no devolvió el resultado');
    const decoded = result.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const report = JSON.parse(decoded);
    assert.equal(report.passed, true, `${report.error || ''} (completados: ${report.scenarios.join('; ')})`);
    assert.equal(report.viewport, width, 'El viewport no corresponde al ancho móvil solicitado');
    assert.equal(report.scenarios.length, 5);
  });
}
