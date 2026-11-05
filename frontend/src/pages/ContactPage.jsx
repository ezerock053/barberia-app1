import { Container, Row, Col, Card } from 'react-bootstrap';
import { site } from '../config/site.js';

export default function ContactPage() {
  const details = [
    ['DIRECCIÓN', [site.address.street, site.address.locality, site.address.province, site.address.postalCode,
      site.address.country === 'AR' ? 'Argentina' : site.address.country].filter(Boolean).join(', ')],
    ['TELÉFONO', site.phone ? <a href={`tel:${site.phone.replace(/[^+\d]/g, '')}`}>{site.phone}</a> : 'Pendiente de configurar'],
    ['WHATSAPP', site.whatsapp ? <a href={`https://wa.me/${site.whatsapp}`}>Contactar por WhatsApp</a> : 'Pendiente de configurar'],
    ['HORARIOS', site.texts.openingHours],
    ...(site.email ? [['CORREO', <a href={`mailto:${site.email}`}>{site.email}</a>]] : []),
    ...(site.instagram ? [['INSTAGRAM', <a href={site.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>]] : []),
  ];
  return <section className="page-section" id="contacto"><Container><div className="eyebrow">VENÍ A CONOCERNOS</div><h1 className="page-title">Contacto</h1><p className="page-intro">{site.texts.contactIntro}</p><Row className="g-3">{details.map(([label, value]) => <Col sm={6} key={label}><Card className="contact-card h-100"><Card.Body><div className="eyebrow">{label}</div><p>{value}</p></Card.Body></Card></Col>)}</Row></Container></section>;
}
