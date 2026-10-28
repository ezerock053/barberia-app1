'use strict';

class MercadoPagoError extends Error {
  constructor(status) {
    super('Mercado Pago order request failed');
    this.name = 'MercadoPagoError';
    this.status = status;
  }
}

function isCheckoutUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && /^www\.mercadopago\.(?:com(?:\.[a-z]{2})?|[a-z]{2})$/i.test(url.hostname);
  } catch {
    return false;
  }
}

async function createCheckoutOrder({ accessToken, idempotencyKey, appointmentId, serviceName, servicePrice, customerEmail }) {
  let response;
  try {
    response = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        type: 'online',
        processing_mode: 'manual',
        total_amount: String(servicePrice),
        external_reference: `barberia-appointment-${appointmentId}`,
        payer: { email: customerEmail },
        items: [{
          title: serviceName,
          quantity: 1,
          unit_price: String(servicePrice),
        }],
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new MercadoPagoError(0);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new MercadoPagoError(response.status);
  }

  if (!response.ok || typeof data?.id !== 'string' || !isCheckoutUrl(data.checkout_url)) {
    throw new MercadoPagoError(response.status);
  }

  return { orderId: data.id, checkoutUrl: data.checkout_url };
}

async function getCheckoutOrder({ accessToken, orderId }) {
  let response;
  try {
    response = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new MercadoPagoError(0);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new MercadoPagoError(response.status);
  }

  if (!response.ok || typeof data?.id !== 'string') {
    throw new MercadoPagoError(response.status);
  }

  return data;
}

module.exports = { createCheckoutOrder, getCheckoutOrder, MercadoPagoError };
