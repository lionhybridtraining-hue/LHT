/**
 * scheduled-charge-processor.js
 *
 * Netlify Scheduled Function — runs periodically to process due payment charges.
 *
 * Flow per charge:
 *   1. Find charges with due_date <= today and status in (pending, failed, overdue)
 *   2. For each, attempt to charge via Stripe Payment Intent (off-session)
 *   3. On success: mark paid, record stripe refs
 *   4. On failure: increment retry_count, set grace_period_ends_at, mark failed/overdue
 *   5. If retries exhausted + grace expired: mark overdue, optionally pause plan
 *   6. If all charges in a plan are paid, mark plan as completed
 *
 * Schedule: configured via netlify.toml [functions."scheduled-charge-processor"] schedule
 */

const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const {
  listDuePaymentCharges,
  updatePaymentCharge,
  updatePaymentPlan,
  getPaymentPlanCharges
} = require("./_lib/supabase");
const { getStripeClient } = require("./_lib/stripe");

async function processCharge(config, stripe, charge) {
  const plan = charge.payment_plans;
  if (!plan || plan.status !== "active") {
    return { chargeId: charge.id, skipped: true, reason: "plan_not_active" };
  }

  const maxRetries = plan.max_retry_attempts || 3;
  const graceDays = plan.grace_period_days || 7;

  // Check if retries exhausted and grace expired
  if (charge.retry_count >= maxRetries && charge.grace_period_ends_at) {
    const graceEnd = new Date(charge.grace_period_ends_at);
    if (new Date() > graceEnd) {
      await updatePaymentCharge(config, charge.id, { status: "overdue" });
      return { chargeId: charge.id, status: "overdue", reason: "grace_period_expired" };
    }
  }

  // Mark processing
  await updatePaymentCharge(config, charge.id, { status: "processing" });

  try {
    // Create Stripe Payment Intent off-session
    // Requires the customer to have a saved payment method
    // The identity_id maps to a Stripe customer via the existing purchase record
    const customerId = await resolveStripeCustomer(config, stripe, plan);
    if (!customerId) {
      await updatePaymentCharge(config, charge.id, {
        status: "failed",
        failure_reason: "no_stripe_customer",
        retry_count: charge.retry_count + 1
      });
      return { chargeId: charge.id, status: "failed", reason: "no_stripe_customer" };
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: charge.amount_cents,
      currency: (charge.currency || plan.currency || "eur").toLowerCase(),
      customer: customerId,
      off_session: true,
      confirm: true,
      metadata: {
        payment_plan_id: charge.payment_plan_id,
        charge_id: charge.id,
        charge_number: String(charge.charge_number),
        program_id: plan.program_id || ""
      },
      description: charge.charge_label || `Parcela ${charge.charge_number}`
    }, {
      idempotencyKey: `charge_${charge.id}_attempt_${charge.retry_count + 1}`
    });

    // Success
    await updatePaymentCharge(config, charge.id, {
      status: "paid",
      stripe_payment_intent_id: paymentIntent.id,
      stripe_charge_id: paymentIntent.latest_charge || null,
      paid_at: new Date().toISOString(),
      failure_reason: null,
      grace_period_ends_at: null
    });

    // Check if entire plan is now complete
    await checkPlanCompletion(config, charge.payment_plan_id);

    return { chargeId: charge.id, status: "paid", paymentIntentId: paymentIntent.id };

  } catch (err) {
    const newRetryCount = charge.retry_count + 1;
    const isRetryExhausted = newRetryCount >= maxRetries;

    const gracePeriodEndsAt = isRetryExhausted && !charge.grace_period_ends_at
      ? new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000).toISOString()
      : charge.grace_period_ends_at;

    const nextAttemptAt = isRetryExhausted
      ? null
      : new Date(Date.now() + Math.min(newRetryCount * 24 * 60 * 60 * 1000, 3 * 24 * 60 * 60 * 1000)).toISOString();

    await updatePaymentCharge(config, charge.id, {
      status: isRetryExhausted ? "overdue" : "failed",
      failure_reason: err.message || "payment_failed",
      failed_at: new Date().toISOString(),
      retry_count: newRetryCount,
      next_attempt_at: nextAttemptAt,
      grace_period_ends_at: gracePeriodEndsAt
    });

    return {
      chargeId: charge.id,
      status: isRetryExhausted ? "overdue" : "failed",
      reason: err.message,
      retryCount: newRetryCount
    };
  }
}

async function resolveStripeCustomer(config, stripe, plan) {
  // If there's a linked stripe_purchase, use its customer_id
  if (plan.stripe_purchase_id) {
    try {
      await require("./_lib/supabase").getPaymentPlanById(config, plan.id);
      // Fallback: search Stripe customers by identity
    } catch (_) { /* fallback below */ }
  }

  // Search Stripe for customer matching the identity
  if (plan.identity_id) {
    try {
      const customers = await stripe.customers.search({
        query: `metadata["identity_id"]:"${plan.identity_id}"`,
        limit: 1
      });
      if (customers && customers.data && customers.data[0]) {
        return customers.data[0].id;
      }
    } catch (_) { /* search not available, try list */ }

    // Fallback: if we have the purchase record we can get customer_id directly
  }

  return null;
}

async function checkPlanCompletion(config, planId) {
  const charges = await getPaymentPlanCharges(config, planId);
  if (!charges.length) return;

  const allDone = charges.every((c) =>
    c.status === "paid" || c.status === "skipped" || c.status === "cancelled"
  );

  if (allDone) {
    await updatePaymentPlan(config, planId, { status: "completed" });
  }
}

exports.handler = async (event) => {
  try {
    const config = getConfig();
    const stripe = getStripeClient(config);
    const today = new Date().toISOString().slice(0, 10);

    const dueCharges = await listDuePaymentCharges(config, { beforeDate: today });

    if (!dueCharges.length) {
      return json(200, { processed: 0, message: "No charges due" });
    }

    const results = [];
    // Process sequentially to avoid overwhelming Stripe rate limits
    for (const charge of dueCharges) {
      const result = await processCharge(config, stripe, charge);
      results.push(result);
    }

    const paid = results.filter((r) => r.status === "paid").length;
    const failed = results.filter((r) => r.status === "failed" || r.status === "overdue").length;
    const skipped = results.filter((r) => r.skipped).length;

    return json(200, {
      processed: results.length,
      paid,
      failed,
      skipped,
      results
    });
  } catch (err) {
    return json(500, { error: err.message || "Scheduler error" });
  }
};
