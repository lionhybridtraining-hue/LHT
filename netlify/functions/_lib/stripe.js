const Stripe = require("stripe");

let cachedClient = null;
let cachedKey = "";

function getStripeClient(config) {
  if (!config || !config.stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  if (!cachedClient || cachedKey !== config.stripeSecretKey) {
    cachedClient = new Stripe(config.stripeSecretKey);
    cachedKey = config.stripeSecretKey;
  }

  return cachedClient;
}

function normalizeStripeError(error) {
  if (!error) return "Stripe request failed";
  if (typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return "Stripe request failed";
}

function toIsoFromUnix(seconds) {
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function toStripePurchaseRecord({
  session,
  identityId,
  programId,
  billingType,
  fallbackEmail,
  source,
  subscription
}) {
  if (!session || !identityId || !programId) {
    throw new Error("session, identityId, and programId are required");
  }

  const normalizedBillingType = billingType === "recurring" ? "recurring" : "one_time";
  const paid = session.payment_status === "paid" || session.status === "complete";
  const periodEnd = subscription && Number.isFinite(subscription.current_period_end)
    ? toIsoFromUnix(subscription.current_period_end)
    : null;

  return {
    stripe_session_id: session.id,
    stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
    stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
    stripe_subscription_id: typeof session.subscription === "string"
      ? session.subscription
      : subscription && typeof subscription.id === "string"
        ? subscription.id
        : null,
    identity_id: identityId,
    program_id: programId,
    email: session.customer_details && session.customer_details.email
      ? session.customer_details.email
      : fallbackEmail || null,
    amount_cents: Number.isFinite(session.amount_total) ? session.amount_total : 0,
    currency: typeof session.currency === "string" ? session.currency.toUpperCase() : "EUR",
    billing_type: normalizedBillingType,
    status: paid ? "paid" : "pending",
    source: source || "stripe",
    paid_at: paid ? new Date().toISOString() : null,
    expires_at: normalizedBillingType === "recurring" ? periodEnd : null
  };
}

module.exports = {
  getStripeClient,
  normalizeStripeError,
  toIsoFromUnix,
  toStripePurchaseRecord
};