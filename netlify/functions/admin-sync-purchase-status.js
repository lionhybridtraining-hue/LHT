const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { getStripeClient, normalizeStripeError } = require("./_lib/stripe");
const {
  getStripePurchaseByPaymentIntentId,
  updateStripePurchasesByPaymentIntentId
} = require("./_lib/supabase");

function deriveStatusFromPI(pi) {
  if (!pi) return null;
  const latestCharge = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const latestChargeRefunded = Number.isFinite(latestCharge && latestCharge.amount_refunded)
    ? latestCharge.amount_refunded
    : 0;
  const amountRefunded = Number.isFinite(pi.amount_refunded)
    ? pi.amount_refunded
    : latestChargeRefunded;
  const totalAmount = pi.amount || 0;
  if (pi.status === "canceled") return "cancelled";
  if (latestCharge && latestCharge.refunded === true) return "refunded";
  if (amountRefunded > 0 && amountRefunded >= totalAmount) return "refunded";
  if (pi.status === "succeeded") return "paid";
  if (["requires_payment_method", "requires_confirmation", "requires_action", "processing"].includes(pi.status)) return "pending";
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const body = parseJsonBody(event);
    const paymentIntentId = (body.payment_intent_id || "").toString().trim();

    if (!paymentIntentId) {
      return json(400, { error: "payment_intent_id e obrigatorio" });
    }

    const stripe = getStripeClient(config);

    const [purchase, pi] = await Promise.all([
      getStripePurchaseByPaymentIntentId(config, paymentIntentId),
      stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] }).catch(() => null)
    ]);

    if (!purchase) {
      return json(404, { error: "Compra nao encontrada com este payment_intent_id" });
    }

    if (!pi) {
      return json(404, { error: "Payment Intent nao encontrado no Stripe" });
    }

    const derivedStatus = deriveStatusFromPI(pi);
    if (!derivedStatus) {
      return json(200, {
        ok: true,
        changed: false,
        currentStatus: purchase.status,
        stripeStatus: pi.status,
        message: "Nao foi possivel determinar um estado a partir do Stripe"
      });
    }

    const changed = derivedStatus !== purchase.status;
    if (changed) {
      await updateStripePurchasesByPaymentIntentId(config, paymentIntentId, {
        status: derivedStatus,
        ...(derivedStatus === "refunded" ? { expires_at: new Date().toISOString() } : {})
      });
    }

    return json(200, {
      ok: true,
      changed,
      previousStatus: purchase.status,
      newStatus: derivedStatus,
      stripeStatus: pi.status,
      amountRefunded: Number.isFinite(pi.amount_refunded)
        ? pi.amount_refunded
        : (pi.latest_charge && typeof pi.latest_charge === "object" && Number.isFinite(pi.latest_charge.amount_refunded)
          ? pi.latest_charge.amount_refunded
          : 0)
    });
  } catch (err) {
    return json(500, { error: normalizeStripeError(err) });
  }
};
