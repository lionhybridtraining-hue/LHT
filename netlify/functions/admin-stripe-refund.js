const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { getStripeClient, refundPayment, normalizeStripeError } = require("./_lib/stripe");
const { getStripePurchaseByPaymentIntentId, updateStripePurchasesByPaymentIntentId } = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const stripe = getStripeClient(config);
    const body = parseJsonBody(event);
    const paymentIntentId = (body.payment_intent_id || "").toString().trim();
    const amountCents = body.amount_cents != null ? Number(body.amount_cents) : undefined;

    if (!paymentIntentId) {
      return json(400, { error: "payment_intent_id e obrigatorio" });
    }

    // Verify purchase exists in our DB
    const purchase = await getStripePurchaseByPaymentIntentId(config, paymentIntentId);
    if (!purchase) {
      return json(404, { error: "Compra nao encontrada com este payment_intent_id" });
    }

    if (purchase.status === "refunded") {
      return json(400, { error: "Esta compra ja foi reembolsada" });
    }

    // Process refund via Stripe
    const refund = await refundPayment({
      paymentIntentId,
      amountCents: Number.isFinite(amountCents) && amountCents > 0 ? amountCents : undefined
    });

    // Update local DB
    const isPartial = Number.isFinite(amountCents) && amountCents > 0 && amountCents < (purchase.amount_cents || 0);
    const currentRefunded = Number.isFinite(purchase.amount_refunded_cents) ? purchase.amount_refunded_cents : 0;
    const refundedAmount = refund.amount || amountCents || purchase.amount_cents || 0;
    const newTotalRefunded = currentRefunded + refundedAmount;
    const fullyRefunded = newTotalRefunded >= (purchase.amount_cents || 0);

    const updated = await updateStripePurchasesByPaymentIntentId(config, paymentIntentId, {
      status: fullyRefunded ? "refunded" : "paid",
      amount_refunded_cents: newTotalRefunded,
      expires_at: fullyRefunded ? new Date().toISOString() : purchase.expires_at
    });

    return json(200, {
      ok: true,
      refund: {
        id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status
      },
      purchaseUpdated: updated.length
    });
  } catch (err) {
    return json(500, { error: normalizeStripeError(err) });
  }
};
