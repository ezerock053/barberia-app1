import { site } from '../config/site.js';
import { useEffect, useState } from 'react';
import { Alert, Col, Container, Row, Spinner } from 'react-bootstrap';
import { getBarbers } from '../services/api.js';
import BarberCard from '../components/BarberCard.jsx';
export default function BarbersPage({ initialCatalog }) {
 const [barbers, setBarbers] = useState(() => initialCatalog?.barbers ?? []); const [loading, setLoading] = useState(() => initialCatalog == null); const [error, setError] = useState(false);
 useEffect(() => {
  if (initialCatalog) return;
  let active = true;
  getBarbers().then((items) => { if (active) setBarbers(items); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, [initialCatalog]);
 return <section className="page-section"><Container><div className="eyebrow">MANOS EXPERTAS</div><h1 className="page-title">Nuestros barberos</h1><p className="page-intro">{site.texts.barbersIntro}</p>{loading ? <Spinner animation="border" role="status" /> : error ? <Alert variant="warning">No pudimos cargar el equipo. Intentá nuevamente más tarde.</Alert> : barbers.length ? <Row className="g-3">{barbers.map((barber, index) => <Col sm={6} lg={4} key={barber.id}><BarberCard barber={barber} priority={index === 0} /></Col>)}</Row> : <p className="muted-copy">Pronto vas a conocer a nuestro equipo.</p>}</Container></section>;
}
