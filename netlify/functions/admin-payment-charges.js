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
  listTrainingPrograms
} = require("./_lib/supabase");

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
      dueDateFrom: qs.dueDateFrom || undefined,
      dueDateTo: qs.dueDateTo || undefined,
      programId: qs.program_id || undefined,
      limit: qs.limit ? Number(qs.limit) : 200,
      offset: qs.offset ? Number(qs.offset) : 0
    };

    const [charges, programRows] = await Promise.all([
      listAllPaymentChargesAdmin(config, filters),
      listTrainingPrograms(config)
    ]);

    const programMap = {};
    (Array.isArray(programRows) ? programRows : []).forEach((p) => {
      programMap[p.id] = p.name || p.external_id || p.id;
    });

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const next7d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const mapped = charges.map((c) => {
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
        planStatus: plan.status || null,
        createdAt: c.created_at
      };
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
    return json(500, { error: err.message || "Erro ao listar linhas de pagamento" });
  }
};
