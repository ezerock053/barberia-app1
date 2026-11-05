import { Container } from 'react-bootstrap';
import { site } from '../config/site.js';
export default function SiteFooter() { return <footer className="site-footer"><Container className="d-flex flex-column flex-md-row justify-content-between gap-2"><span>{site.name}</span><span>{site.texts.tagline}</span><span>© {new Date().getFullYear()}</span></Container></footer>; }
