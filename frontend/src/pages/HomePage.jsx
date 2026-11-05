import { useEffect, useState } from 'react';
import { Button, Col, Container, Row } from 'react-bootstrap';
import { getBarbers, getServices } from '../services/api.js';
import ServiceCard from '../components/ServiceCard.jsx';
import BarberCard from '../components/BarberCard.jsx';
import { site } from '../config/site.js';
export default function HomePage() {
  const [services, setServices] = useState([]); const [barbers, setBarbers] = useState([]);
  useEffect(() => { getServices().then(setServices).catch(() => {}); getBarbers().then(setBarbers).catch(() => {}); }, []);
  return <><section className="hero" id="inicio"><Container><div className="hero-content"><div className="eyebrow">{site.texts.homeEyebrow}</div><h1>{site.texts.homeTitle}<br /><span>{site.texts.homeAccent}</span></h1><p>{site.texts.homeIntro}</p><Button variant="warning" size="lg" href="/reservar">Reservar turno <span aria-hidden="true">↗</span></Button></div><div className="hero-stamp">CORTES<br />CON<br />CARÁCTER</div></Container></section>
  <section className="section-space" id="servicios"><Container><div className="section-heading"><div><div className="eyebrow">LO QUE HACEMOS</div><h2>{site.texts.servicesHeading}</h2></div><a href="/servicios">Ver servicios <span>↗</span></a></div><Row className="g-3" id="servicios-lista">{services.slice(0, 3).map((service) => <Col md={4} key={service.id}><ServiceCard service={service} /></Col>)}</Row>{services.length === 0 && <p className="muted-copy">Descubrí nuestros cortes, barba y más.</p>}</Container></section>
  <section className="section-space section-muted" id="barberos"><Container><div className="section-heading"><div><div className="eyebrow">MANOS EXPERTAS</div><h2>{site.texts.barbersHeading}</h2></div><a href="/barberos">Nuestro equipo <span>↗</span></a></div><Row className="g-3" id="barberos-lista">{barbers.slice(0, 3).map((barber) => <Col sm={6} md={4} key={barber.id}><BarberCard barber={barber} /></Col>)}</Row>{barbers.length === 0 && <p className="muted-copy">Un equipo que entiende de estilo y detalle.</p>}</Container></section>
  <section className="booking-banner"><Container className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-4"><div><div className="eyebrow">TU PRÓXIMO CORTE TE ESPERA</div><h2>{site.texts.bannerTitle}</h2></div><Button variant="warning" size="lg" href="/reservar">Reservar turno <span>↗</span></Button></Container></section></>;
}
