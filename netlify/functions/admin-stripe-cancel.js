const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { getStripeClient, cancelSubscription, normalizeStripeError } = require("./_lib/stripe");
const { getStripePurchaseBySubscriptionId, updateStripePurchasesBySubscriptionId } = require("./_lib/supabase");

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
    const subscriptionId = (body.subscription_id || "").toString().trim();
    const cancelAtPeriodEnd = Boolean(body.cancel_at_period_end);

    if (!subscriptionId) {
      return json(400, { error: "subscription_id e obrigatorio" });
    }

    // Verify purchase exists
    const purchase = await getStripePurchaseBySubscriptionId(config, subscriptionId);
    if (!purchase) {
      return json(404, { error: "Compra nao encontrada com esta subscription_id" });
    }

    if (purchase.status === "cancelled") {
      return json(400, { error: "Esta subscricao ja foi cancelada" });
    }

    // Cancel via Stripe
    const subscription = await cancelSubscription({ subscriptionId, cancelAtPeriodEnd });

    // Update local DB
    const now = new Date().toISOString();
    const patch = cancelAtPeriodEnd
      ? { status: "paid", expires_at: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : now }
      : { status: "cancelled", expires_at: now };

    const updated = await updateStripePurchasesBySubscriptionId(config, subscriptionId, patch);

    return json(200, {
      ok: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: subscription.current_period_end
      },
      purchaseUpdated: updated.length
    });
  } catch (err) {
    return json(500, { error: normalizeStripeError(err) });
  }
};
