import { useState } from 'react';
import { Container, Nav, Navbar } from 'react-bootstrap';
const links = [['Inicio', '#inicio'], ['Servicios', '#servicios'], ['Barberos', '#barberos'], ['Reservar turno', '#reservar'], ['Contacto', '#contacto']];
export default function SiteNavbar() {
  const [expanded, setExpanded] = useState(false);
  return <Navbar expand="lg" variant="dark" className="site-navbar" expanded={expanded} onToggle={setExpanded}><Container><Navbar.Brand href="#inicio" onClick={() => setExpanded(false)}><span className="brand-mark">B.</span> NOMBRE BARBERÍA</Navbar.Brand><Navbar.Toggle aria-controls="main-navigation" aria-label="Abrir navegación" /><Navbar.Collapse id="main-navigation"><Nav className="ms-auto align-items-lg-center gap-lg-3">{links.map(([label, href]) => <Nav.Link key={href} href={href} onClick={() => setExpanded(false)}>{label}</Nav.Link>)}</Nav></Navbar.Collapse></Container></Navbar>;
}
