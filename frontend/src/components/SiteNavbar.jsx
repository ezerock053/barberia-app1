import { useState } from 'react';
import { Container, Nav, Navbar } from 'react-bootstrap';
import { site } from '../config/site.js';
const links = [['Inicio', '/'], ['Servicios', '/servicios'], ['Barberos', '/barberos'], ['Reservar turno', '/reservar'], ['Contacto', '/contacto']];
export default function SiteNavbar() {
  const [expanded, setExpanded] = useState(false);
  return <Navbar expand="lg" variant="dark" className="site-navbar" expanded={expanded} onToggle={setExpanded}><Container><Navbar.Brand href="/" onClick={() => setExpanded(false)}>{site.logo ? <img src={site.logo} alt="" width="32" height="32" className="me-2" /> : <span className="brand-mark">{site.name.charAt(0)}.</span>}{site.name}</Navbar.Brand><Navbar.Toggle aria-controls="main-navigation" aria-label="Abrir navegación" /><Navbar.Collapse id="main-navigation"><Nav className="ms-auto align-items-lg-center gap-lg-3">{links.map(([label, href]) => <Nav.Link key={href} href={href} onClick={() => setExpanded(false)}>{label}</Nav.Link>)}</Nav></Navbar.Collapse></Container></Navbar>;
}
