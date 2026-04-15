const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listStripePurchases, listTrainingPrograms, updateStripePurchaseById } = require("./_lib/supabase");
const { getStripeClient } = require("./_lib/stripe");
const { reportOperationalError } = require("./_lib/ops-notifications");

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

function deriveStatusFromPaymentIntent(pi, fallbackStatus = "pending") {
  if (!pi || typeof pi !== "object") return fallbackStatus;
  const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const amount = Number.isFinite(pi.amount) ? pi.amount : 0;
  const chargeRefunded = Number.isFinite(charge && charge.amount_refunded) ? charge.amount_refunded : 0;
  const refunded = Number.isFinite(pi.amount_refunded) ? pi.amount_refunded : chargeRefunded;
  if (pi.status === "canceled") return "cancelled";
  if (charge && charge.refunded === true) return "refunded";
  if (amount > 0 && refunded >= amount) return "refunded";
  if (pi.status === "succeeded") return "paid";
  if (["requires_payment_method", "requires_confirmation", "requires_action", "processing"].includes(pi.status)) return "pending";
  return fallbackStatus;
}

function resolveDetailedPaymentMethod(pi, fallback) {
  if (!pi || typeof pi !== "object") return fallback;
  const pm = pi.payment_method && typeof pi.payment_method === "object" ? pi.payment_method : null;
  if (!pm) {
    if (Array.isArray(pi.payment_method_types) && pi.payment_method_types[0]) {
      return String(pi.payment_method_types[0]).toLowerCase();
    }
    return fallback;
  }

  const type = String(pm.type || "").toLowerCase();
  if (!type) return fallback;
  if (type === "card" && pm.card) {
    const brand = pm.card.brand ? String(pm.card.brand).toLowerCase() : "card";
    const last4 = pm.card.last4 ? String(pm.card.last4) : "";
    return last4 ? `${brand} **** ${last4}` : brand;
  }
  return type;
}

function buildPaymentDashboardUrl(pi) {
  if (!pi || !pi.id) return null;
  return `https://dashboard.stripe.com/${pi.livemode ? "" : "test/"}payments/${encodeURIComponent(pi.id)}`;
}

async function enrichWithStripeLive(config, purchases, { includeRaw = false } = {}) {
  if (!Array.isArray(purchases) || !purchases.length) return purchases;
  let stripe = null;
  try {
    stripe = getStripeClient(config);
  } catch (_) {
    stripe = null;
  }
  if (!stripe) return purchases;

  const cache = new Map();
  return Promise.all(purchases.map(async (p) => {
    const piId = p && p.stripePaymentIntentId ? p.stripePaymentIntentId : null;
    if (!piId || p.isSynthetic) {
      return {
        ...p,
        stripeLiveStatus: null,
        stripeChargeStatus: null,
        stripeAmountRefundedCents: 0,
        stripeAmountReceivedCents: null,
        stripeDashboardUrl: null,
        stripeReceiptUrl: null,
        stripeSyncedAt: null
      };
    }

    let live = cache.get(piId);
    if (!live) {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId, {
          expand: ["payment_method", "latest_charge", "customer"]
        });
        const charge = pi && pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
        live = {
          status: deriveStatusFromPaymentIntent(pi, p.status),
          paymentIntentStatus: pi && pi.status ? String(pi.status) : null,
          chargeStatus: charge && charge.status ? String(charge.status) : null,
          refundedCents: Number.isFinite(pi && pi.amount_refunded)
            ? pi.amount_refunded
            : (Number.isFinite(charge && charge.amount_refunded) ? charge.amount_refunded : 0),
          amountReceivedCents: Number.isFinite(pi && pi.amount_received) ? pi.amount_received : null,
          paymentMethod: resolveDetailedPaymentMethod(pi, p.paymentMethod),
          dashboardUrl: buildPaymentDashboardUrl(pi),
          receiptUrl: charge && charge.receipt_url ? String(charge.receipt_url) : null,
          amountCents: Number.isFinite(pi && pi.amount) ? pi.amount : p.amountCents,
          currency: pi && typeof pi.currency === "string" ? pi.currency.toUpperCase() : p.currency,
          customerName: pi.customer && typeof pi.customer === 'object' ? (pi.customer.name || pi.customer.email || null) : null,
          raw: includeRaw ? { paymentIntent: pi, latestCharge: charge } : null
        };
      } catch (_) {
        live = null;
      }
      cache.set(piId, live);
    }

    if (!live) {
      return {
        ...p,
        stripeLiveStatus: null,
        stripeChargeStatus: null,
        stripeAmountRefundedCents: 0,
        stripeAmountReceivedCents: null,
        stripeDashboardUrl: null,
        stripeReceiptUrl: null,
        stripeSyncedAt: null
      };
    }

    if (p.id && (
      live.status !== p.status ||
      live.amountCents !== p.amountCents ||
      String(live.currency || "").toUpperCase() !== String(p.currency || "").toUpperCase()
    )) {
      await updateStripePurchaseById(config, p.id, {
        status: live.status,
        amount_cents: live.amountCents,
        currency: live.currency,
        ...(live.status === "refunded" ? { expires_at: new Date().toISOString() } : {})
      });
    }

    return {
      ...p,
      status: live.status,
      amountCents: live.amountCents,
      currency: live.currency,
      paymentMethod: live.paymentMethod || p.paymentMethod,
      stripeLiveStatus: live.paymentIntentStatus,
      stripeChargeStatus: live.chargeStatus,
      stripeAmountRefundedCents: live.refundedCents,
      stripeAmountReceivedCents: live.amountReceivedCents,
      stripeDashboardUrl: live.dashboardUrl,
      stripeReceiptUrl: live.receiptUrl,
      stripeRaw: live.raw,
      customerName: live.customerName || p.customerName || null,
      stripeSyncedAt: new Date().toISOString()
    };
  }));
}

exports.handler = async (event) => {
  let config;
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const qs = event.queryStringParameters || {};
    const requestedStatus = String(qs.status || "").trim().toLowerCase() || null;
    const includeRaw = String(qs.include_raw || "").trim() === "1";
    const filters = {
      status: undefined,
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
      customerName: p.customer_name || null,
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

    const mappedWithMethod = await enrichPaymentMethods(config, mappedBase);
    const mapped = await enrichWithStripeLive(config, mappedWithMethod, { includeRaw });

    const channelFilter = (qs.channel || "").trim().toLowerCase();
    const byChannel = channelFilter
      ? mapped.filter((p) => p.checkoutChannel === channelFilter)
      : mapped;
    const filtered = requestedStatus
      ? byChannel.filter((p) => String(p.status || "").toLowerCase() === requestedStatus)
      : byChannel;

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
    await reportOperationalError(config, {
      source: "admin-stripe-purchases",
      title: "Falha ao listar compras Stripe",
      error: err,
      status: 500,
      metadata: {
        method: event && event.httpMethod ? event.httpMethod : null,
        path: event && event.path ? event.path : null
      }
    });
    return json(500, { error: err.message || "Erro ao listar compras" });
  }
};
