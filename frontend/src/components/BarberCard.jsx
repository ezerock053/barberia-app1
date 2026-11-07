import { Card } from 'react-bootstrap';

export default function BarberCard({ barber, priority = false }) {
  return <Card className="barber-card h-100">
    {barber.image
      ? <Card.Img
        variant="top"
        src={barber.image}
        alt={barber.name}
        width="640"
        height="480"
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
      />
      : <div className="barber-placeholder" aria-label="Retrato no disponible"><span>{barber.name?.charAt(0)?.toUpperCase() || 'B'}</span></div>}
    <Card.Body><div className="eyebrow">BARBERO</div><Card.Title>{barber.name}</Card.Title></Card.Body>
  </Card>;
}
