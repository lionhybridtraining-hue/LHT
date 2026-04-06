const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { getStripeClient, normalizeStripeError } = require("./_lib/stripe");

function getPromotionCoupon(promo) {
  if (!promo || !promo.promotion || promo.promotion.type !== "coupon") return null;
  const coupon = promo.promotion.coupon;
  if (!coupon || typeof coupon === "string") return null;
  return coupon;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const body = parseJsonBody(event);
    const code = (body.coupon_code || "").toString().trim().toUpperCase().slice(0, 100);

    if (!code) {
      return json(400, { error: "Codigo de desconto obrigatorio" });
    }

    const stripe = getStripeClient(config);
    const list = await stripe.promotionCodes.list({
      code,
      active: true,
      limit: 1,
      expand: ["data.promotion.coupon"]
    });

    if (!list || !Array.isArray(list.data) || !list.data[0]) {
      return json(404, { error: "Codigo de desconto invalido ou expirado" });
    }

    const promo = list.data[0];
    const coupon = getPromotionCoupon(promo);
    if (!coupon || !coupon.valid) {
      return json(404, { error: "Codigo de desconto invalido ou expirado" });
    }

    return json(200, {
      ok: true,
      promoId: promo.id,
      couponId: coupon.id,
      name: coupon.name || code,
      percentOff: coupon.percent_off || 0,
      amountOff: coupon.amount_off || 0,
      currency: coupon.currency || null
    });
  } catch (error) {
    return json(500, { error: normalizeStripeError(error) });
  }
};
