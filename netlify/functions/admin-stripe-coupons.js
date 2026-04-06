const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { getStripeClient, listCoupons, createCoupon, deleteCoupon, listPromotionCodes, createPromotionCode, normalizeStripeError } = require("./_lib/stripe");

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

function getPromotionCouponId(promotionCode) {
  const promotion = promotionCode && promotionCode.promotion ? promotionCode.promotion : null;
  const coupon = promotion && promotion.type === "coupon" ? promotion.coupon : null;
  if (!coupon) return null;
  return typeof coupon === "string" ? coupon : coupon.id || null;
}

exports.handler = async (event) => {
  const method = event.httpMethod;

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const stripe = getStripeClient(config);

    if (method === "GET") {
      const [coupons, promoCodes] = await Promise.all([listCoupons(), listPromotionCodes()]);
      // Index promo codes by coupon id
      const promosByCoupon = {};
      promoCodes.forEach((pc) => {
        const couponId = getPromotionCouponId(pc);
        if (!couponId) return;
        if (!promosByCoupon[couponId]) promosByCoupon[couponId] = [];
        promosByCoupon[couponId].push({ id: pc.id, code: pc.code, active: pc.active, timesRedeemed: pc.times_redeemed });
      });
      return json(200, {
        coupons: coupons.map((c) => ({ ...mapCoupon(c), promotionCodes: promosByCoupon[c.id] || [] }))
      });
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

      // Automatically create a Promotion Code so the code is usable at checkout
      const promoCode = name.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
      let promotionCode = null;
      if (promoCode) {
        try {
          promotionCode = await createPromotionCode({
            couponId: coupon.id,
            code: promoCode,
            maxRedemptions: body.max_redemptions ? Number(body.max_redemptions) : undefined
          });
        } catch (promoErr) {
          // Promo code creation failed (e.g. code already exists) — coupon still created
          console.warn("admin-stripe-coupons: promotion code creation failed:", promoErr.message);
        }
      }

      return json(201, {
        coupon: { ...mapCoupon(coupon), promotionCodes: promotionCode ? [{ id: promotionCode.id, code: promotionCode.code, active: promotionCode.active }] : [] },
        promotionCode: promotionCode ? { id: promotionCode.id, code: promotionCode.code } : null
      });
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
