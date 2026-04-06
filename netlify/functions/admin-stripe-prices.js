const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { getStripeClient, listPricesForProduct, createPriceForProduct, archivePrice, normalizeStripeError } = require("./_lib/stripe");

function mapPrice(p) {
  return {
    id: p.id,
    productId: p.product,
    unitAmount: p.unit_amount,
    currency: p.currency ? p.currency.toUpperCase() : null,
    recurring: p.recurring ? { interval: p.recurring.interval, intervalCount: p.recurring.interval_count } : null,
    active: p.active,
    createdAt: p.created ? new Date(p.created * 1000).toISOString() : null
  };
}

exports.handler = async (event) => {
  const method = event.httpMethod;

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const stripe = getStripeClient(config);

    if (method === "GET") {
      const qs = event.queryStringParameters || {};
      const productId = (qs.product_id || "").trim();
      if (!productId) return json(400, { error: "product_id e obrigatorio" });

      const prices = await listPricesForProduct(productId);
      return json(200, { prices: prices.map(mapPrice) });
    }

    if (method === "POST") {
      const body = parseJsonBody(event);
      const productId = (body.product_id || "").toString().trim();
      const priceCents = Number(body.price_cents);
      const currency = (body.currency || "EUR").toString().trim();
      let recurring = false;

      if (body.recurring && typeof body.recurring === "object") {
        const interval = String(body.recurring.interval || "month").trim().toLowerCase();
        const intervalCountRaw = Number(body.recurring.interval_count || body.recurring.intervalCount || 1);
        const intervalCount = Number.isInteger(intervalCountRaw) && intervalCountRaw > 0 ? intervalCountRaw : 1;

        if (!["day", "week", "month", "year"].includes(interval)) {
          return json(400, { error: "recurring.interval invalido" });
        }

        recurring = {
          interval,
          intervalCount
        };
      } else {
        recurring = Boolean(body.recurring);
      }

      if (!productId) return json(400, { error: "product_id e obrigatorio" });
      if (!Number.isFinite(priceCents) || priceCents <= 0) return json(400, { error: "price_cents deve ser um numero positivo" });

      const price = await createPriceForProduct({ productId, priceCents, currency, recurring });
      return json(201, { price: mapPrice(price) });
    }

    if (method === "PATCH") {
      const body = parseJsonBody(event);
      const priceId = (body.price_id || "").toString().trim();
      if (!priceId) return json(400, { error: "price_id e obrigatorio" });

      const price = await archivePrice(priceId);
      return json(200, { price: mapPrice(price) });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    return json(500, { error: normalizeStripeError(err) });
  }
};
