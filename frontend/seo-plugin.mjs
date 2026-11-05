import fs from 'node:fs';
import path from 'node:path';
import { publicRoutes, routePolicy } from './src/config/routes.js';
import { htmlForRoute, robotsTxt, sitemapXml, validateSite } from './site-tools.mjs';

export function siteSeoPlugin(site) {
  validateSite(site);
  let output;
  let source;
  let building = false;
  let indexable = false;
  function requestPolicy(render, serveAll = false) { return (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    const pathname = (req.url || '/').split('?')[0];
    if (pathname.startsWith('/api/') || pathname === '/api' || pathname.startsWith('/@') || pathname.startsWith('/src/') || pathname.startsWith('/node_modules/') || pathname.startsWith('/assets/')) return next();
    if (!serveAll && pathname === '/site.config.json' && new URL(req.url, 'http://localhost').searchParams.has('import')) return next();
    const publicFile = path.resolve(source, 'public', `.${pathname}`);
    if (publicFile.startsWith(path.resolve(source, 'public') + path.sep) && fs.existsSync(publicFile) && fs.statSync(publicFile).isFile()) return next();
    const policy = routePolicy(pathname, indexable);
    res.setHeader('X-Robots-Tag', policy.robots);
    if (policy.status === 404 || serveAll) {
      Promise.resolve(render(pathname, policy)).then((html) => {
        res.statusCode = policy.status;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(req.method === 'HEAD' ? '' : html);
      }).catch(next);
    } else next();
  }; }
  return {
    name: 'barbershop-site-policy',
    enforce: 'post',
    configResolved(config) {
      output = path.resolve(config.root, config.build.outDir);
      source = config.root;
      building = config.command === 'build';
      indexable = site.indexable && site.environment === 'production' && config.mode === 'production' && (config.command === 'build' || Boolean(config.isPreview));
    },
    configureServer(server) { server.middlewares.use(requestPolicy((pathname) => server.transformIndexHtml(pathname, fs.readFileSync(path.join(source, 'index.html'), 'utf8')))); },
    configurePreviewServer(server) { server.middlewares.use(requestPolicy((_pathname, policy) => fs.readFileSync(path.join(output, policy.file), 'utf8'), true)); },
    transformIndexHtml(html, context) {
      return htmlForRoute(html, (context.originalUrl || '/').split('?')[0], site, indexable);
    },
    closeBundle() {
      if (!building) return;
      const rootHtml = path.join(output, 'index.html');
      if (!fs.existsSync(rootHtml)) return;
      const html = fs.readFileSync(rootHtml, 'utf8');
      for (const pathname of [...Object.keys(publicRoutes), '/admin', '/__not_found__']) {
        const policy = routePolicy(pathname, indexable);
        const file = path.join(output, policy.file);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, htmlForRoute(html, pathname, site, indexable));
      }
      fs.writeFileSync(path.join(output, 'site-policy.json'), JSON.stringify({ version: 1, indexable,
        routes: Object.fromEntries(Object.keys(publicRoutes).map((pathname) => [pathname, routePolicy(pathname, indexable)])) }));
      fs.writeFileSync(path.join(output, 'sitemap.xml'), sitemapXml(site, indexable));
      fs.writeFileSync(path.join(output, 'robots.txt'), robotsTxt(site));
    },
  };
}
