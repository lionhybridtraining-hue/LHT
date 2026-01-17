// Netlify Function: Stripe Webhook → Verify and emit GA4 purchase
// Env vars (set in Netlify Dashboard):
// - STRIPE_WEBHOOK_SECRET: your Stripe webhook signing secret
// - GA_MEASUREMENT_ID: GA4 Measurement ID (e.g., G-K3EJSN5M4Y)
// - GA_API_SECRET: GA4 API Secret (create under Data Streams → Measurement Protocol)

const crypto = require('crypto');

function parseStripeSignature(header) {
  // Example: t=1697049600,v1=signature,v0=... (we use v1)
  const parts = (header || '').split(',').map(p => p.trim());
  let timestamp = null;
  const signatures = [];
  parts.forEach(p => {
    const [k, v] = p.split('=');
    if (k === 't') timestamp = v;
    if (k === 'v1') signatures.push(v);
  });
  return { timestamp, signatures };
}

function computeSignature(secret, timestamp, payload) {
  const signedPayload = `${timestamp}.${payload}`;
  return crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
}

function safeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function sendGaPurchase({ measurementId, apiSecret, transactionId, value, currency, items }) {
  if (!measurementId || !apiSecret) return { ok: false, reason: 'missing_ga_config' };
  const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

  const payload = {
    client_id: 'server-webhook',
    events: [{
      name: 'purchase',
      params: {
        transaction_id: transactionId,
        value: Number(value || 0),
        currency: (currency || 'EUR').toUpperCase(),
        items: items && items.length ? items : [{ item_id: 'AER', item_name: 'Reserva AER' }]
      }
    }]
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return { ok: res.ok, status: res.status };
}

exports.handler = async (event) => {
  const sigHeader = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return { statusCode: 500, body: 'Missing STRIPE_WEBHOOK_SECRET' };
  }
  if (!sigHeader) {
    return { statusCode: 400, body: 'Missing Stripe-Signature header' };
  }

  const { timestamp, signatures } = parseStripeSignature(sigHeader);
  const expected = computeSignature(secret, timestamp, event.body || '');
  const valid = signatures.some(sig => safeCompare(expected, sig));
  if (!valid) {
    return { statusCode: 400, body: 'Invalid signature' };
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Capture completed purchases from Payment Links/Checkout
  const type = stripeEvent.type;
  const obj = stripeEvent.data && stripeEvent.data.object ? stripeEvent.data.object : {};

  let purchase = null;
  if (type === 'checkout.session.completed') {
    // amount_total in cents
    purchase = {
      transactionId: obj.id,
      value: (obj.amount_total || 0) / 100,
      currency: obj.currency || 'eur',
      items: [{ item_id: 'AER', item_name: 'Reserva AER' }]
    };
  } else if (type === 'payment_intent.succeeded') {
    // amount in cents
    purchase = {
      transactionId: obj.id,
      value: (obj.amount || 0) / 100,
      currency: obj.currency || 'eur',
      items: [{ item_id: 'AER', item_name: 'Reserva AER' }]
    };
  } else if (type === 'charge.succeeded') {
    purchase = {
      transactionId: obj.id,
      value: (obj.amount || 0) / 100,
      currency: obj.currency || 'eur',
      items: [{ item_id: 'AER', item_name: 'Reserva AER' }]
    };
  }

  // If not a purchase-type event, acknowledge
  if (!purchase) {
    return { statusCode: 200, body: JSON.stringify({ received: true, ignored_type: type }) };
  }

  const measurementId = process.env.GA_MEASUREMENT_ID;
  const apiSecret = process.env.GA_API_SECRET;
  try {
    const result = await sendGaPurchase({
      measurementId,
      apiSecret,
      transactionId: purchase.transactionId,
      value: purchase.value,
      currency: purchase.currency,
      items: purchase.items
    });
    return { statusCode: 200, body: JSON.stringify({ received: true, ga_sent: result }) };
  } catch (err) {
    return { statusCode: 200, body: JSON.stringify({ received: true, ga_error: String(err && err.message || err) }) };
  }
};
