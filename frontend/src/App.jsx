import { lazy, useEffect, useLayoutEffect, useState } from 'react';
import SiteNavbar from './components/SiteNavbar.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import HomePage from './pages/HomePage.jsx';
import ServicesPage from './pages/ServicesPage.jsx';
import BarbersPage from './pages/BarbersPage.jsx';
import BookingPage from './pages/BookingPage.jsx';
import ContactPage from './pages/ContactPage.jsx';
import { LazyModuleBoundary, LazyModuleSuspense } from './components/ModuleLoadBoundary.jsx';
import { site } from './config/site.js';
import { isAdminPath, legacyDestination, normalizePath, routePolicy } from './config/routes.js';
const pages = { '/': HomePage, '/servicios': ServicesPage, '/barberos': BarbersPage, '/reservar': BookingPage, '/contacto': ContactPage };
const AdminGate = lazy(() => import('./admin/AdminGate.jsx'));
export default function App({ initialCatalog }) {
 useLayoutEffect(() => { document.getElementById('seo-prerender')?.remove(); }, []);
 if (isAdminPath(window.location.pathname)) return <LazyModuleBoundary fullPage>
  <LazyModuleSuspense fullPage label="Cargando administración…"><AdminGate /></LazyModuleSuspense>
 </LazyModuleBoundary>;
 return <PublicApp initialCatalog={initialCatalog} />;
}

function PublicApp({ initialCatalog }) {
 const [redirecting, setRedirecting] = useState(false);
 const path = normalizePath(window.location.pathname);
 useEffect(() => {
   const redirect = () => {
     const destination = legacyDestination(window.location.pathname, window.location.hash, window.location.search);
     if (destination !== null) { setRedirecting(true); window.location.replace(destination); }
   };
   redirect(); window.addEventListener('hashchange', redirect);
   return () => window.removeEventListener('hashchange', redirect);
 }, []);
 useEffect(() => {
   const indexable = site.indexable && site.environment === 'production' && !site.isExample;
   const policy = routePolicy(path, indexable);
   document.title = `${policy.title} | ${site.name}`;
   const description = policy.descriptionKey ? site.texts[policy.descriptionKey] : site.description;
   let descriptionTag = document.querySelector('meta[name="description"]');
   if (!descriptionTag) { descriptionTag = document.createElement('meta'); descriptionTag.name = 'description'; document.head.append(descriptionTag); }
   descriptionTag.content = description;
   let robots = document.querySelector('meta[name="robots"]');
   if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
   robots.content = policy.robots;
   let canonical = document.querySelector('link[rel="canonical"]');
   if (policy.descriptionKey) {
     if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
     canonical.href = new URL(policy.path, `${site.publicUrl}/`).href;
   } else canonical?.remove();
 }, [path]);
 const Page = pages[path];
 const catalogPage = path === '/' || path === '/servicios' || path === '/barberos';
 return <><SiteNavbar /><main>{redirecting ? <p className="admin-empty" role="status">Abriendo página…</p> : Page ? <Page initialCatalog={catalogPage ? initialCatalog : null} /> : <section className="page-section"><div className="container"><h1>Página no encontrada</h1><p>La dirección solicitada no existe.</p><a href="/">Volver al inicio</a></div></section>}</main><SiteFooter /></>;
}
