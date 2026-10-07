import { useEffect, useState } from 'react';
import { Alert, Col, Container, Row, Spinner } from 'react-bootstrap';
import { getBarbers } from '../services/api.js';
import BarberCard from '../components/BarberCard.jsx';
export default function BarbersPage() {
 const [barbers, setBarbers] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
 useEffect(() => { getBarbers().then(setBarbers).catch(() => setError(true)).finally(() => setLoading(false)); }, []);
 return <section className="page-section"><Container><div className="eyebrow">MANOS EXPERTAS</div><h1 className="page-title">Nuestros barberos</h1><p className="page-intro">Personas apasionadas por el oficio y los buenos detalles.</p>{loading ? <Spinner animation="border" role="status" /> : error ? <Alert variant="warning">No pudimos cargar el equipo. Intentá nuevamente más tarde.</Alert> : barbers.length ? <Row className="g-3">{barbers.map((barber) => <Col sm={6} lg={4} key={barber.id}><BarberCard barber={barber} /></Col>)}</Row> : <p className="muted-copy">Pronto vas a conocer a nuestro equipo.</p>}</Container></section>;
}
