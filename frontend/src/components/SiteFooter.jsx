import { Container } from 'react-bootstrap';
export default function SiteFooter() { return <footer className="site-footer"><Container className="d-flex flex-column flex-md-row justify-content-between gap-2"><span>NOMBRE BARBERÍA</span><span>Estilo clásico, actitud propia.</span><span>© {new Date().getFullYear()}</span></Container></footer>; }
