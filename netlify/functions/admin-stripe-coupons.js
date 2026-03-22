const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { getStripeClient, listCoupons, createCoupon, deleteCoupon, normalizeStripeError } = require("./_lib/stripe");

function mapCoupon(c) {
  return {
    id: c.id,
    name: c.name,
    percentOff: c.percent_off,
    amountOff: c.amount_off,
    currency: c.currency ? c.currency.toUpperCase() : null,
    duration: c.duration,
    durationInMonths: c.duration_in_months,
    maxRedemptions: c.max_redemptions,
    timesRedeemed: c.times_redeemed,
    valid: c.valid,
    createdAt: c.created ? new Date(c.created * 1000).toISOString() : null
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
      const coupons = await listCoupons();
      return json(200, { coupons: coupons.map(mapCoupon) });
    }

    if (method === "POST") {
      const body = parseJsonBody(event);
      const name = (body.name || "").toString().trim();
      if (!name) return json(400, { error: "name e obrigatorio" });

      const percentOff = body.percent_off != null ? Number(body.percent_off) : undefined;
      const amountOff = body.amount_off != null ? Number(body.amount_off) : undefined;

      if (!percentOff && !amountOff) {
        return json(400, { error: "percent_off ou amount_off e obrigatorio" });
      }

      const coupon = await createCoupon({
        name,
        percentOff: percentOff || undefined,
        amountOff: amountOff || undefined,
        currency: body.currency || "EUR",
        duration: body.duration || "once",
        durationInMonths: body.duration_in_months ? Number(body.duration_in_months) : undefined,
        maxRedemptions: body.max_redemptions ? Number(body.max_redemptions) : undefined
      });

      return json(201, { coupon: mapCoupon(coupon) });
    }

    if (method === "DELETE") {
      const body = parseJsonBody(event);
      const couponId = (body.coupon_id || "").toString().trim();
      if (!couponId) return json(400, { error: "coupon_id e obrigatorio" });

      await deleteCoupon(couponId);
      return json(200, { ok: true, deleted: couponId });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    return json(500, { error: normalizeStripeError(err) });
  }
};
