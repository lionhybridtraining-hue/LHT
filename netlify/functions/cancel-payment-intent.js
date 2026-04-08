const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { getStripeClient, normalizeStripeError } = require("./_lib/stripe");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const body = parseJsonBody(event);
    const paymentIntentId = (body.payment_intent_id || "").toString().trim();

    if (!paymentIntentId) {
      return json(400, { error: "payment_intent_id is required" });
    }

    const stripe = getStripeClient(config);

    // Verify the PI belongs to the authenticated user by checking metadata
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (!pi || !pi.metadata || pi.metadata.identity_id !== auth.user.sub) {
      return json(403, { error: "Not authorized to cancel this payment intent" });
    }

    // Only cancel if it's still cancellable
    if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(pi.status)) {
      await stripe.paymentIntents.cancel(paymentIntentId);
    }

    return json(200, { ok: true });
  } catch (err) {
    return json(500, { error: normalizeStripeError(err) });
  }
};
