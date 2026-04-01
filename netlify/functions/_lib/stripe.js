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

function toPaymentIntentPurchaseRecord({
  paymentIntent,
  identityId,
  programId,
  billingType,
  email,
  source,
  subscriptionId,
  expiresAt
}) {
  if (!paymentIntent || !identityId || !programId) {
    throw new Error("paymentIntent, identityId, and programId are required");
  }

  const normalizedBillingType = billingType === "recurring" ? "recurring" : "one_time";
  const paid = paymentIntent.status === "succeeded";

  return {
    stripe_session_id: null,
    stripe_customer_id: typeof paymentIntent.customer === "string" ? paymentIntent.customer : null,
    stripe_payment_intent_id: paymentIntent.id,
    stripe_subscription_id: typeof subscriptionId === "string" && subscriptionId ? subscriptionId : null,
    identity_id: identityId,
    program_id: programId,
    email: email || null,
    amount_cents: Number.isFinite(paymentIntent.amount) ? paymentIntent.amount : 0,
    currency: typeof paymentIntent.currency === "string" ? paymentIntent.currency.toUpperCase() : "EUR",
    billing_type: normalizedBillingType,
    status: paid ? "paid" : "pending",
    source: source || "stripe",
    paid_at: paid ? new Date().toISOString() : null,
    expires_at: normalizedBillingType === "recurring" ? (expiresAt || null) : null
  };
}

// Cria produto e preço no Stripe
async function createStripeProductAndPrice({ name, description, priceCents, currency = 'EUR', recurring = false }) {
  const stripe = cachedClient;
  if (!stripe) throw new Error('Stripe client not initialized');
  const product = await stripe.products.create({ name, description });
  const price = await stripe.prices.create({
    unit_amount: priceCents,
    currency,
    product: product.id,
    ...(recurring ? { recurring: { interval: 'month' } } : {})
  });
  return { productId: product.id, priceId: price.id };
}

// Reembolso via Stripe
async function refundPayment({ paymentIntentId, amountCents }) {
  const stripe = cachedClient;
  if (!stripe) throw new Error('Stripe client not initialized');
  const params = { payment_intent: paymentIntentId };
  if (Number.isFinite(amountCents) && amountCents > 0) {
    params.amount = amountCents;
  }
  return stripe.refunds.create(params);
}

// Cancelar subscrição
async function cancelSubscription({ subscriptionId, cancelAtPeriodEnd = false }) {
  const stripe = cachedClient;
  if (!stripe) throw new Error('Stripe client not initialized');
  if (cancelAtPeriodEnd) {
    return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  }
  return stripe.subscriptions.cancel(subscriptionId);
}

// Listar cupões
async function listCoupons({ limit = 100 } = {}) {
  const stripe = cachedClient;
  if (!stripe) throw new Error('Stripe client not initialized');
  const result = await stripe.coupons.list({ limit });
  return result.data || [];
}

// Criar cupão
async function createCoupon({ name, percentOff, amountOff, currency, duration, durationInMonths, maxRedemptions }) {
  const stripe = cachedClient;
  if (!stripe) throw new Error('Stripe client not initialized');
  const params = { name, duration: duration || 'once' };
  if (percentOff) {
    params.percent_off = percentOff;
  } else if (amountOff) {
    params.amount_off = amountOff;
    params.currency = (currency || 'EUR').toLowerCase();
  }
  if (duration === 'repeating' && durationInMonths) {
    params.duration_in_months = durationInMonths;
  }
  if (Number.isFinite(maxRedemptions) && maxRedemptions > 0) {
    params.max_redemptions = maxRedemptions;
  }
  return stripe.coupons.create(params);
}

// Desativar cupão
async function deleteCoupon(couponId) {
  const stripe = cachedClient;
  if (!stripe) throw new Error('Stripe client not initialized');
  return stripe.coupons.del(couponId);
}

// Listar preços por produto
async function listPricesForProduct(productId) {
  const stripe = cachedClient;
  if (!stripe) throw new Error('Stripe client not initialized');
  const result = await stripe.prices.list({ product: productId, limit: 50 });
  return result.data || [];
}

// Criar preço para produto existente
async function createPriceForProduct({ productId, priceCents, currency = 'EUR', recurring = false }) {
  const stripe = cachedClient;
  if (!stripe) throw new Error('Stripe client not initialized');
  return stripe.prices.create({
    unit_amount: priceCents,
    currency: currency.toLowerCase(),
    product: productId,
    ...(recurring ? { recurring: { interval: 'month' } } : {})
  });
}

// Arquivar preço
async function archivePrice(priceId) {
  const stripe = cachedClient;
  if (!stripe) throw new Error('Stripe client not initialized');
  return stripe.prices.update(priceId, { active: false });
}

// Verificar se produto e preço existem e estão activos
async function syncStripeStatus({ productId, priceId }) {
  const stripe = cachedClient;
  if (!stripe) throw new Error('Stripe client not initialized');
  const result = { productExists: false, productActive: false, priceExists: false, priceActive: false };
  if (productId) {
    try {
      const product = await stripe.products.retrieve(productId);
      result.productExists = true;
      result.productActive = Boolean(product.active);
    } catch (e) {
      if (e.code !== 'resource_missing') throw e;
    }
  }
  if (priceId) {
    try {
      const price = await stripe.prices.retrieve(priceId);
      result.priceExists = true;
      result.priceActive = Boolean(price.active);
    } catch (e) {
      if (e.code !== 'resource_missing') throw e;
    }
  }
  return result;
}

// Gerar Payment Link
async function createPaymentLink({ priceId, metadata }) {
  const stripe = cachedClient;
  if (!stripe) throw new Error('Stripe client not initialized');
  return stripe.paymentLinks.create({
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    metadata: metadata || {}
  });
}

module.exports = {
  getStripeClient,
  normalizeStripeError,
  toIsoFromUnix,
  toStripePurchaseRecord,
  toPaymentIntentPurchaseRecord,
  createStripeProductAndPrice,
  refundPayment,
  cancelSubscription,
  listCoupons,
  createCoupon,
  deleteCoupon,
  listPricesForProduct,
  createPriceForProduct,
  archivePrice,
  syncStripeStatus,
  createPaymentLink
};