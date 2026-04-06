const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listStripePurchases, listTrainingPrograms } = require("./_lib/supabase");
const { getStripeClient } = require("./_lib/stripe");

function resolveCheckoutChannel(purchase) {
  if (!purchase || typeof purchase !== "object") return "other";
  if (purchase.source === "admin_override") return "admin_override";
  if (purchase.stripe_payment_intent_id && !purchase.stripe_session_id) return "onsite";
  if (purchase.stripe_session_id) return "checkout_session";
  return "other";
}

function isSyntheticPurchase(purchase) {
  if (!purchase || typeof purchase !== "object") return false;
  const identityId = String(purchase.identity_id || "").toLowerCase();
  const email = String(purchase.email || "").toLowerCase();
  const sessionId = String(purchase.stripe_session_id || "").toLowerCase();
  const paymentIntentId = String(purchase.stripe_payment_intent_id || "").toLowerCase();
  return (
    identityId.startsWith("e2e-") ||
    email.includes("e2e-") ||
    email.endsWith("@example.com") ||
    sessionId.startsWith("cs_test_") ||
    paymentIntentId.startsWith("pi_test_")
  );
}

function formatBillingMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "one_time") return "pagamento_unico";
  if (normalized === "recurring") return "recorrente";
  return normalized || "-";
}

function inferPaymentMethodFallback(purchase) {
  if (!purchase || typeof purchase !== "object") return "-";
  if (purchase.source === "admin_override") return "manual_admin";
  if (purchase.source === "stripe_simulated") return "simulado";
  if (purchase.stripe_payment_intent_id && !purchase.stripe_session_id) return "stripe_elements";
  if (purchase.stripe_session_id) return "stripe_checkout";
  return "stripe";
}

async function enrichPaymentMethods(config, purchases) {
  if (!Array.isArray(purchases) || !purchases.length) return purchases;
  let stripe = null;
  try {
    stripe = getStripeClient(config);
  } catch (_) {
    stripe = null;
  }

  if (!stripe) {
    return purchases.map((p) => ({ ...p, paymentMethod: inferPaymentMethodFallback(p) }));
  }

  const cache = new Map();
  return Promise.all(purchases.map(async (p) => {
    const piId = p && p.stripe_payment_intent_id ? p.stripe_payment_intent_id : null;
    if (!piId) {
      return { ...p, paymentMethod: inferPaymentMethodFallback(p) };
    }

    if (cache.has(piId)) {
      return { ...p, paymentMethod: cache.get(piId) };
    }

    try {
      const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["payment_method"] });
      let method = null;
      if (pi && pi.payment_method && typeof pi.payment_method === "object" && pi.payment_method.type) {
        method = String(pi.payment_method.type).toLowerCase();
      } else if (Array.isArray(pi.payment_method_types) && pi.payment_method_types[0]) {
        method = String(pi.payment_method_types[0]).toLowerCase();
      }
      const resolved = method || inferPaymentMethodFallback(p);
      cache.set(piId, resolved);
      return { ...p, paymentMethod: resolved };
    } catch (_) {
      const fallback = inferPaymentMethodFallback(p);
      cache.set(piId, fallback);
      return { ...p, paymentMethod: fallback };
    }
  }));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const qs = event.queryStringParameters || {};
    const filters = {
      status: qs.status || undefined,
      programId: qs.program_id || undefined,
      email: qs.email || undefined,
      source: qs.source || undefined,
      from: qs.from || undefined,
      to: qs.to || undefined,
      limit: qs.limit ? Number(qs.limit) : 200,
      offset: qs.offset ? Number(qs.offset) : 0
    };

    const [purchases, programRows] = await Promise.all([
      listStripePurchases(config, filters),
      listTrainingPrograms(config)
    ]);

    const programMap = {};
    (Array.isArray(programRows) ? programRows : []).forEach((p) => {
      programMap[p.id] = p.name || p.external_id || p.id;
    });

    const mappedBase = purchases.map((p) => {
      const synthetic = isSyntheticPurchase(p);
      const source = synthetic && p.source === "stripe" ? "stripe_simulated" : p.source;
      return {
      id: p.id,
      email: p.email,
      programId: p.program_id,
      programName: (p.training_programs && p.training_programs.name) || programMap[p.program_id] || "-",
      amountCents: p.amount_cents,
      currency: p.currency,
      billingType: p.billing_type,
      status: p.status,
      source,
      stripeSessionId: p.stripe_session_id,
      stripePaymentIntentId: p.stripe_payment_intent_id,
      stripeSubscriptionId: p.stripe_subscription_id,
      stripeCustomerId: p.stripe_customer_id,
      identityId: p.identity_id,
      checkoutChannel: resolveCheckoutChannel(p),
      billingMode: formatBillingMode(p.billing_type),
      isSynthetic: synthetic,
      paidAt: p.paid_at,
      expiresAt: p.expires_at,
      createdAt: p.created_at
      };
    });

    const mapped = await enrichPaymentMethods(config, mappedBase);

    const channelFilter = (qs.channel || "").trim().toLowerCase();
    const filtered = channelFilter
      ? mapped.filter((p) => p.checkoutChannel === channelFilter)
      : mapped;

    // KPIs
    const totalSales = filtered.length;
    const paidSales = filtered.filter((p) => p.status === "paid");
    const totalRevenueCents = paidSales.reduce((sum, p) => sum + (p.amountCents || 0), 0);
    const refundedCount = filtered.filter((p) => p.status === "refunded").length;
    const cancelledCount = filtered.filter((p) => p.status === "cancelled").length;
    const pendingCount = filtered.filter((p) => p.status === "pending").length;
    const abandonedCount = filtered.filter((p) => p.status === "abandoned").length;
    const onsiteCount = filtered.filter((p) => p.checkoutChannel === "onsite").length;
    const checkoutSessionCount = filtered.filter((p) => p.checkoutChannel === "checkout_session").length;

    return json(200, {
      purchases: filtered,
      kpis: {
        totalSales,
        paidCount: paidSales.length,
        totalRevenueCents,
        refundedCount,
        cancelledCount,
        pendingCount,
        abandonedCount,
        onsiteCount,
        checkoutSessionCount
      }
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao listar compras" });
  }
};
