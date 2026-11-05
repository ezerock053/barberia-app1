import { useEffect, useState } from 'react';
import SiteNavbar from './components/SiteNavbar.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import HomePage from './pages/HomePage.jsx';
import ServicesPage from './pages/ServicesPage.jsx';
import BarbersPage from './pages/BarbersPage.jsx';
import BookingPage from './pages/BookingPage.jsx';
import ContactPage from './pages/ContactPage.jsx';
import AdminGate from './admin/AdminGate.jsx';
import { site } from './config/site.js';
import { isAdminPath, legacyDestination, normalizePath, routePolicy } from './config/routes.js';
const pages = { '/': HomePage, '/servicios': ServicesPage, '/barberos': BarbersPage, '/reservar': BookingPage, '/contacto': ContactPage };
export default function App() {
 if (isAdminPath(window.location.pathname)) return <AdminGate />;
 return <PublicApp />;
}

function PublicApp() {
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
 return <><SiteNavbar /><main>{redirecting ? <p className="admin-empty" role="status">Abriendo página…</p> : Page ? <Page /> : <section className="page-section"><div className="container"><h1>Página no encontrada</h1><p>La dirección solicitada no existe.</p><a href="/">Volver al inicio</a></div></section>}</main><SiteFooter /></>;
}
