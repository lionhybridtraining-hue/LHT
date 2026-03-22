const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listStripePurchases, listTrainingPrograms } = require("./_lib/supabase");

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

    const mapped = purchases.map((p) => ({
      id: p.id,
      email: p.email,
      programId: p.program_id,
      programName: (p.training_programs && p.training_programs.name) || programMap[p.program_id] || "-",
      amountCents: p.amount_cents,
      currency: p.currency,
      billingType: p.billing_type,
      status: p.status,
      source: p.source,
      stripeSessionId: p.stripe_session_id,
      stripePaymentIntentId: p.stripe_payment_intent_id,
      stripeSubscriptionId: p.stripe_subscription_id,
      stripeCustomerId: p.stripe_customer_id,
      identityId: p.identity_id,
      paidAt: p.paid_at,
      expiresAt: p.expires_at,
      createdAt: p.created_at
    }));

    // KPIs
    const totalSales = mapped.length;
    const paidSales = mapped.filter((p) => p.status === "paid");
    const totalRevenueCents = paidSales.reduce((sum, p) => sum + (p.amountCents || 0), 0);
    const refundedCount = mapped.filter((p) => p.status === "refunded").length;
    const cancelledCount = mapped.filter((p) => p.status === "cancelled").length;
    const pendingCount = mapped.filter((p) => p.status === "pending").length;
    const abandonedCount = mapped.filter((p) => p.status === "abandoned").length;

    return json(200, {
      purchases: mapped,
      kpis: {
        totalSales,
        paidCount: paidSales.length,
        totalRevenueCents,
        refundedCount,
        cancelledCount,
        pendingCount,
        abandonedCount
      }
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao listar compras" });
  }
};
