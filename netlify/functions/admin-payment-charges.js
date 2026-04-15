/**
 * admin-payment-charges.js
 *
 * Admin endpoint for viewing and managing the payment charges ledger.
 * Provides filters by due_date range, status, program; operational KPIs.
 *
 * Routes:
 *   GET — list charges with filters + KPIs
 */

const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  listAllPaymentChargesAdmin,
  listTrainingPrograms,
  listStripePurchases
} = require("./_lib/supabase");
const { reportOperationalError } = require("./_lib/ops-notifications");

function mapChargeStatusToPurchaseStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "failed") return "payment_failed";
  if (normalized === "overdue" || normalized === "processing" || normalized === "skipped") return undefined;
  return normalized;
}

function mapBillingTypeToMode(billingType) {
  const normalized = String(billingType || "").trim().toLowerCase();
  if (normalized === "one_time") return "pagamento_unico";
  if (normalized === "recurring") return "recorrente";
  if (normalized === "phased") return "faseado";
  return normalized || "-";
}

function inferPurchaseMethod(purchase) {
  if (!purchase || typeof purchase !== "object") return "stripe";
  if (purchase.source === "admin_override") return "manual_admin";
  if (purchase.source === "stripe_simulated") return "simulado";
  if (purchase.stripe_payment_intent_id && !purchase.stripe_session_id) return "stripe_elements";
  if (purchase.stripe_session_id) return "stripe_checkout";
  return "stripe";
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

    const filters = {
      status: qs.status || undefined,
      dueDateFrom: qs.dueDateFrom || undefined,
      dueDateTo: qs.dueDateTo || undefined,
      programId: qs.program_id || undefined,
      limit: qs.limit ? Number(qs.limit) : 200,
      offset: qs.offset ? Number(qs.offset) : 0
    };

    const [charges, programRows, purchases] = await Promise.all([
      listAllPaymentChargesAdmin(config, filters),
      listTrainingPrograms(config),
      listStripePurchases(config, {
        status: mapChargeStatusToPurchaseStatus(filters.status),
        programId: filters.programId,
        from: filters.dueDateFrom,
        to: filters.dueDateTo,
        limit: filters.limit,
        offset: filters.offset
      })
    ]);

    const programMap = {};
    (Array.isArray(programRows) ? programRows : []).forEach((p) => {
      programMap[p.id] = p.name || p.external_id || p.id;
    });

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const next7d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const phasedMapped = charges.map((c) => {
      const plan = c.payment_plans || {};
      const programName = plan.training_programs
        ? plan.training_programs.name
        : (plan.program_id ? programMap[plan.program_id] || "-" : "-");

      return {
        id: c.id,
        paymentPlanId: c.payment_plan_id,
        chargeNumber: c.charge_number,
        chargeLabel: c.charge_label,
        amountCents: c.amount_cents,
        currency: c.currency || plan.currency || "EUR",
        dueDate: c.due_date,
        status: c.status,
        paidAt: c.paid_at,
        failedAt: c.failed_at,
        failureReason: c.failure_reason,
        retryCount: c.retry_count,
        nextAttemptAt: c.next_attempt_at,
        gracePeriodEndsAt: c.grace_period_ends_at,
        identityId: plan.identity_id || null,
        programId: plan.program_id || null,
        programName,
        billingMode: "faseado",
        paymentMethod: "scheduler_stripe",
        planStatus: plan.status || null,
        createdAt: c.created_at
      };
    });

    const purchaseMapped = (Array.isArray(purchases) ? purchases : []).map((p) => {
      const statusMap = {
        paid: "paid",
        pending: "pending",
        payment_failed: "failed",
        cancelled: "cancelled",
        refunded: "refunded",
        abandoned: "cancelled"
      };
      const lineStatus = statusMap[p.status] || "pending";
      const dueDate = (p.paid_at || p.created_at || "").slice(0, 10) || null;
      const billingType = p.billing_type || "one_time";
      const source = p.source || "stripe";
      return {
        id: `purchase:${p.id}`,
        paymentPlanId: p.payment_plan_id || null,
        chargeNumber: 1,
        chargeLabel: `Compra ${billingType} (${source})`,
        amountCents: p.amount_cents,
        currency: p.currency || "EUR",
        dueDate,
        status: lineStatus,
        paidAt: p.paid_at || null,
        failedAt: lineStatus === "failed" ? (p.updated_at || p.created_at || null) : null,
        failureReason: lineStatus === "failed" ? "payment_failed" : null,
        retryCount: 0,
        nextAttemptAt: null,
        gracePeriodEndsAt: p.grace_period_ends_at || null,
        identityId: p.identity_id || null,
        programId: p.program_id || null,
        programName: (p.training_programs && p.training_programs.name) || programMap[p.program_id] || "-",
        billingMode: mapBillingTypeToMode(p.billing_type),
        paymentMethod: inferPurchaseMethod(p),
        planStatus: null,
        createdAt: p.created_at,
        rowType: "purchase"
      };
    });

    const mapped = [...phasedMapped, ...purchaseMapped].sort((a, b) => {
      const ad = String(a.dueDate || a.createdAt || "");
      const bd = String(b.dueDate || b.createdAt || "");
      return bd.localeCompare(ad);
    });

    // KPIs
    const dueToday = mapped.filter((c) =>
      c.dueDate === today && (c.status === "pending" || c.status === "processing")
    ).length;

    const overdueCount = mapped.filter((c) => c.status === "overdue").length;

    const failedLast24h = mapped.filter((c) =>
      c.status === "failed" && c.failedAt && c.failedAt >= yesterday
    ).length;

    const collectedTodayCents = mapped
      .filter((c) => c.status === "paid" && c.paidAt && c.paidAt.slice(0, 10) === today)
      .reduce((sum, c) => sum + (c.amountCents || 0), 0);

    const scheduledNext7dCents = mapped
      .filter((c) =>
        (c.status === "pending" || c.status === "failed") &&
        c.dueDate >= today && c.dueDate <= next7d
      )
      .reduce((sum, c) => sum + (c.amountCents || 0), 0);

    const paidCount = mapped.filter((c) => c.status === "paid").length;
    const pendingCount = mapped.filter((c) => c.status === "pending").length;
    const failedCount = mapped.filter((c) => c.status === "failed").length;
    const cancelledCount = mapped.filter((c) => c.status === "cancelled").length;
    const skippedCount = mapped.filter((c) => c.status === "skipped").length;

    return json(200, {
      charges: mapped,
      kpis: {
        total: mapped.length,
        dueToday,
        overdueCount,
        failedLast24h,
        collectedTodayCents,
        scheduledNext7dCents,
        paidCount,
        pendingCount,
        failedCount,
        cancelledCount,
        skippedCount
      }
    });
  } catch (err) {
    await reportOperationalError(config, {
      source: "admin-payment-charges",
      title: "Falha ao listar linhas de pagamento",
      error: err,
      status: 500,
      metadata: {
        method: event && event.httpMethod ? event.httpMethod : null,
        path: event && event.path ? event.path : null
      }
    });
    return json(500, { error: err.message || "Erro ao listar linhas de pagamento" });
  }
};
