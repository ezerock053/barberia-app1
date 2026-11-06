import test from 'node:test';
import assert from 'node:assert/strict';
import { readInitialCatalog } from '../src/catalog/initialCatalog.js';

function documentFor(payload) {
  return { getElementById: () => ({ textContent: typeof payload === 'string' ? payload : JSON.stringify(payload) }) };
}

test('reads the public catalog serialized in the prerender', () => {
  const payload = { services: [{ id: 12, name: 'Corte', description: null, price: '2500.00' }], barbers: [{ id: 5, name: 'Ana', image: null }] };
  assert.deepEqual(readInitialCatalog(documentFor(payload)), payload);
});

test('returns null for absent or malformed data so the page can use the API fallback', () => {
  assert.equal(readInitialCatalog({ getElementById: () => null }), null);
  assert.equal(readInitialCatalog(documentFor('{invalid')), null);
});

test('rejects the entire catalog when a required or optional field has an invalid shape', () => {
  const invalidCatalogs = [
    { services: [], barbers: [null] },
    { services: [{ name: 'Corte', price: '2500.00' }], barbers: [] },
    { services: [{ id: 0, name: 'Corte', price: '2500.00' }], barbers: [] },
    { services: [{ id: 1, name: '  ', price: '2500.00' }], barbers: [] },
    { services: [{ id: 1, name: 'Corte', price: 2500 }], barbers: [] },
    { services: [{ id: 1, name: 'Corte', price: '1e3' }], barbers: [] },
    { services: [{ id: 1, name: 'Corte', price: '2500.000' }], barbers: [] },
    { services: [{ id: 1, name: 'Corte', price: '2500.00', description: {} }], barbers: [] },
    { services: [], barbers: [{ id: 2, name: '', image: null }] },
    { services: [], barbers: [{ id: 2, name: 'Ana', image: 'javascript:alert(1)' }] },
    { services: [], barbers: [{ id: 2, name: 'Ana', image: '//evil.example/a.png' }] },
    { services: [], barbers: [{ id: 2, name: 'Ana', image: 'https://user:pass@example/a.png' }] },
  ];
  for (const payload of invalidCatalogs) {
    assert.equal(readInitialCatalog(documentFor(payload)), null, JSON.stringify(payload));
  }
});

test('accepts the existing decimal and image URL formats', () => {
  const payload = {
    services: [{ id: 1, name: 'Corte', description: '', price: '0.00' }, { id: 2, name: 'Barba', price: '12345678.90' }],
    barbers: [{ id: 3, name: 'Ana', image: '/uploads/ana.webp' }, { id: 4, name: 'Luis', image: 'https://images.example/luis.jpg' }],
  };
  assert.deepEqual(readInitialCatalog(documentFor(payload)), payload);
});
