import { useEffect, useState } from 'react';
import SiteNavbar from './components/SiteNavbar.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import HomePage from './pages/HomePage.jsx';
import ServicesPage from './pages/ServicesPage.jsx';
import BarbersPage from './pages/BarbersPage.jsx';
import BookingPage from './pages/BookingPage.jsx';
import ContactPage from './pages/ContactPage.jsx';
import AdminGate from './admin/AdminGate.jsx';
const pages = { inicio: HomePage, servicios: ServicesPage, barberos: BarbersPage, reservar: BookingPage, contacto: ContactPage };
function currentPage() { return window.location.hash.slice(1).split('?')[0] || 'inicio'; }
export default function App() {
 if (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')) return <AdminGate />;
 return <PublicApp />;
}

function PublicApp() {
 const [page, setPage] = useState(currentPage);
 useEffect(() => { const update = () => setPage(currentPage()); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
 const Page = pages[page] || HomePage;
 return <><SiteNavbar /><main><Page /></main><SiteFooter /></>;
}
