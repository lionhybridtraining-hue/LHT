/**
 * admin-payment-plans.js
 *
 * Admin endpoint for managing phased payment plans.
 *
 * Routes:
 *   GET  — list plans (filters: identityId, programId, status)
 *   POST — create a phased payment plan with auto-generated charge schedule
 *   PATCH?planId=<id>&action=<pause|resume|cancel> — lifecycle actions
 */

const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  createPaymentPlan,
  getPaymentPlanById,
  updatePaymentPlan,
  listPaymentPlans,
  createPaymentCharges,
  getPaymentPlanCharges,
  updatePaymentCharge,
  getTrainingProgramById
} = require("./_lib/supabase");

function generateChargeSchedule({ totalAmountCents, totalInstallments, startDate, frequency, currency }) {
  const charges = [];
  const perCharge = Math.floor(totalAmountCents / totalInstallments);
  const remainder = totalAmountCents - perCharge * totalInstallments;

  for (let i = 0; i < totalInstallments; i += 1) {
    const dueDate = computeDueDate(startDate, frequency, i);
    charges.push({
      charge_number: i + 1,
      charge_label: `Parcela ${i + 1}/${totalInstallments}`,
      amount_cents: i === 0 ? perCharge + remainder : perCharge,
      currency,
      due_date: dueDate,
      status: "pending"
    });
  }
  return charges;
}

function computeDueDate(startDate, frequency, index) {
  const date = new Date(`${startDate}T00:00:00Z`);
  if (frequency === "weekly") {
    date.setUTCDate(date.getUTCDate() + index * 7);
  } else if (frequency === "biweekly") {
    date.setUTCDate(date.getUTCDate() + index * 14);
  } else {
    date.setUTCMonth(date.getUTCMonth() + index);
  }
  return date.toISOString().slice(0, 10);
}

function computeEndDate(startDate, frequency, totalInstallments) {
  return computeDueDate(startDate, frequency, totalInstallments - 1);
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (!["GET", "POST", "PATCH"].includes(method)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    // ── GET: list plans ──
    if (method === "GET") {
      const qs = event.queryStringParameters || {};
      const plans = await listPaymentPlans(config, {
        identityId: qs.identity_id || undefined,
        programId: qs.program_id || undefined,
        status: qs.status || undefined,
        limit: qs.limit ? Number(qs.limit) : 100,
        offset: qs.offset ? Number(qs.offset) : 0
      });

      const mapped = plans.map((p) => ({
        id: p.id,
        identityId: p.identity_id,
        programId: p.program_id,
        programName: p.training_programs ? p.training_programs.name : null,
        totalAmountCents: p.total_amount_cents,
        currency: p.currency,
        totalInstallments: p.total_installments,
        startDate: p.start_date,
        endDate: p.end_date,
        frequency: p.frequency,
        gracePeriodDays: p.grace_period_days,
        maxRetryAttempts: p.max_retry_attempts,
        status: p.status,
        createdAt: p.created_at
      }));

      return json(200, { plans: mapped });
    }

    // ── POST: create plan + generate charges ──
    if (method === "POST") {
      const body = parseJsonBody(event);

      const identityId = (body.identityId || "").toString().trim();
      const programId = (body.programId || "").toString().trim();
      const totalAmountCents = Number(body.totalAmountCents);
      const totalInstallments = Number(body.totalInstallments);
      const startDate = (body.startDate || "").toString().trim();
      const frequency = (body.frequency || "monthly").toString().trim().toLowerCase();
      const currency = (body.currency || "EUR").toString().trim().toUpperCase() || "EUR";
      const gracePeriodDays = body.gracePeriodDays != null ? Number(body.gracePeriodDays) : 7;
      const maxRetryAttempts = body.maxRetryAttempts != null ? Number(body.maxRetryAttempts) : 3;
      const programAssignmentId = body.programAssignmentId || null;
      const stripePurchaseId = body.stripePurchaseId || null;

      if (!identityId) return json(400, { error: "identityId is required" });
      if (!programId) return json(400, { error: "programId is required" });
      if (!Number.isInteger(totalAmountCents) || totalAmountCents <= 0) {
        return json(400, { error: "totalAmountCents must be a positive integer" });
      }
      if (!Number.isInteger(totalInstallments) || totalInstallments < 2) {
        return json(400, { error: "totalInstallments must be at least 2" });
      }
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return json(400, { error: "startDate must be in YYYY-MM-DD format" });
      }
      if (!["weekly", "biweekly", "monthly"].includes(frequency)) {
        return json(400, { error: "frequency must be weekly, biweekly or monthly" });
      }

      const program = await getTrainingProgramById(config, programId);
      if (!program) return json(404, { error: "Program not found" });

      const endDate = computeEndDate(startDate, frequency, totalInstallments);

      const plan = await createPaymentPlan(config, {
        identity_id: identityId,
        program_id: programId,
        program_assignment_id: programAssignmentId,
        stripe_purchase_id: stripePurchaseId,
        total_amount_cents: totalAmountCents,
        currency,
        total_installments: totalInstallments,
        start_date: startDate,
        end_date: endDate,
        frequency,
        grace_period_days: gracePeriodDays,
        max_retry_attempts: maxRetryAttempts,
        status: "active"
      });

      if (!plan) return json(500, { error: "Failed to create payment plan" });

      const chargeSchedule = generateChargeSchedule({
        totalAmountCents,
        totalInstallments,
        startDate,
        frequency,
        currency
      });

      const chargesPayload = chargeSchedule.map((c) => ({
        payment_plan_id: plan.id,
        ...c
      }));

      const charges = await createPaymentCharges(config, chargesPayload);

      return json(201, {
        plan: {
          id: plan.id,
          identityId: plan.identity_id,
          programId: plan.program_id,
          totalAmountCents: plan.total_amount_cents,
          currency: plan.currency,
          totalInstallments: plan.total_installments,
          startDate: plan.start_date,
          endDate: plan.end_date,
          frequency: plan.frequency,
          status: plan.status
        },
        charges: charges.map((c) => ({
          id: c.id,
          chargeNumber: c.charge_number,
          chargeLabel: c.charge_label,
          amountCents: c.amount_cents,
          dueDate: c.due_date,
          status: c.status
        }))
      });
    }

    // ── PATCH: lifecycle actions ──
    const qs = event.queryStringParameters || {};
    const planId = (qs.planId || "").toString().trim();
    const action = (qs.action || "").toString().trim().toLowerCase();

    if (!planId) return json(400, { error: "planId is required" });

    const plan = await getPaymentPlanById(config, planId);
    if (!plan) return json(404, { error: "Payment plan not found" });

    if (action === "pause") {
      if (plan.status !== "active") {
        return json(400, { error: "Only active plans can be paused" });
      }
      const updated = await updatePaymentPlan(config, planId, { status: "paused" });
      return json(200, { plan: updated, action: "paused" });
    }

    if (action === "resume") {
      if (plan.status !== "paused") {
        return json(400, { error: "Only paused plans can be resumed" });
      }
      const updated = await updatePaymentPlan(config, planId, { status: "active" });
      return json(200, { plan: updated, action: "resumed" });
    }

    if (action === "cancel") {
      if (plan.status === "cancelled" || plan.status === "completed") {
        return json(400, { error: "Plan is already " + plan.status });
      }
      const updated = await updatePaymentPlan(config, planId, { status: "cancelled" });

      // Cancel all pending charges
      const charges = await getPaymentPlanCharges(config, planId);
      const pendingCharges = charges.filter((c) =>
        c.status === "pending" || c.status === "failed" || c.status === "overdue"
      );
      const cancelled = await Promise.all(
        pendingCharges.map((c) => updatePaymentCharge(config, c.id, { status: "cancelled" }))
      );

      return json(200, { plan: updated, action: "cancelled", chargesCancelled: cancelled.length });
    }

    // Retry a specific charge
    if (action === "retry") {
      const chargeId = (qs.chargeId || "").toString().trim();
      if (!chargeId) return json(400, { error: "chargeId is required for retry" });

      const body = parseJsonBody(event);
      const charge = await (async () => {
        const { getPaymentChargeById } = require("./_lib/supabase");
        return getPaymentChargeById(config, chargeId);
      })();
      if (!charge) return json(404, { error: "Charge not found" });
      if (charge.payment_plan_id !== planId) return json(400, { error: "Charge does not belong to this plan" });
      if (charge.status === "paid" || charge.status === "cancelled" || charge.status === "skipped") {
        return json(400, { error: "Charge is " + charge.status + " and cannot be retried" });
      }

      // Reset charge for next scheduler run
      const updated = await updatePaymentCharge(config, chargeId, {
        status: "pending",
        next_attempt_at: new Date().toISOString(),
        retry_count: charge.retry_count
      });

      return json(200, { charge: updated, action: "retry_scheduled" });
    }

    // Skip a specific charge
    if (action === "skip") {
      const chargeId = (qs.chargeId || "").toString().trim();
      if (!chargeId) return json(400, { error: "chargeId is required for skip" });

      const charge = await (async () => {
        const { getPaymentChargeById } = require("./_lib/supabase");
        return getPaymentChargeById(config, chargeId);
      })();
      if (!charge) return json(404, { error: "Charge not found" });
      if (charge.payment_plan_id !== planId) return json(400, { error: "Charge does not belong to this plan" });
      if (charge.status === "paid") return json(400, { error: "Paid charges cannot be skipped" });

      const updated = await updatePaymentCharge(config, chargeId, { status: "skipped" });
      return json(200, { charge: updated, action: "skipped" });
    }

    return json(400, { error: "action must be pause, resume, cancel, retry or skip" });

  } catch (err) {
    return json(500, { error: err.message || "Erro interno" });
  }
};
