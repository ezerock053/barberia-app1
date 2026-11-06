import { site } from '../config/site.js';
import { useEffect, useState } from 'react';
import { Alert, Col, Container, Row, Spinner } from 'react-bootstrap';
import { getServices } from '../services/api.js';
import ServiceCard from '../components/ServiceCard.jsx';
export default function ServicesPage({ initialCatalog }) {
 const [services, setServices] = useState(() => initialCatalog?.services ?? []); const [loading, setLoading] = useState(() => initialCatalog == null); const [error, setError] = useState(false);
 useEffect(() => {
  if (initialCatalog) return;
  let active = true;
  getServices().then((items) => { if (active) setServices(items); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [initialCatalog]);
 return <section className="page-section"><Container><div className="eyebrow">NUESTRO MENÚ</div><h1 className="page-title">Servicios</h1><p className="page-intro">{site.texts.servicesIntro}</p>{loading ? <Spinner animation="border" role="status" /> : error ? <Alert variant="warning">No pudimos cargar los servicios. Intentá nuevamente más tarde.</Alert> : services.length ? <Row className="g-3">{services.map((service) => <Col md={6} lg={4} key={service.id}><ServiceCard service={service} /></Col>)}</Row> : <p className="muted-copy">Pronto vas a encontrar nuestros servicios acá.</p>}</Container></section>;
}
