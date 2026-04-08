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
  getPaymentPlanCharges,
  listExpiredGracePeriodPurchases,
  updateStripePurchaseById,
  pauseInstancesByStripeSubscription
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
    const customerId = await resolveStripeCustomer(config, stripe, plan);
    if (!customerId) {
      await updatePaymentCharge(config, charge.id, {
        status: "failed",
        failure_reason: "no_stripe_customer",
        retry_count: charge.retry_count + 1
      });
      return { chargeId: charge.id, status: "failed", reason: "no_stripe_customer" };
    }

    // Resolve default payment method from the customer
    let defaultPaymentMethod = null;
    try {
      const customer = await stripe.customers.retrieve(customerId);
      defaultPaymentMethod = customer.invoice_settings && customer.invoice_settings.default_payment_method
        ? customer.invoice_settings.default_payment_method
        : customer.default_source || null;
      if (!defaultPaymentMethod) {
        // Fallback: list payment methods and pick the first card
        const methods = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
        if (methods && methods.data && methods.data[0]) {
          defaultPaymentMethod = methods.data[0].id;
        }
      }
    } catch (_) { /* non-fatal: PI.create will use customer default if available */ }

    if (!defaultPaymentMethod) {
      await updatePaymentCharge(config, charge.id, {
        status: "failed",
        failure_reason: "no_payment_method",
        retry_count: charge.retry_count + 1
      });
      return { chargeId: charge.id, status: "failed", reason: "no_payment_method" };
    }

    const piParams = {
      amount: charge.amount_cents,
      currency: (charge.currency || plan.currency || "eur").toLowerCase(),
      customer: customerId,
      payment_method: defaultPaymentMethod,
      off_session: true,
      confirm: true,
      metadata: {
        payment_plan_id: charge.payment_plan_id,
        charge_id: charge.id,
        charge_number: String(charge.charge_number),
        program_id: plan.program_id || ""
      },
      description: charge.charge_label || `Parcela ${charge.charge_number}`
    };

    const paymentIntent = await stripe.paymentIntents.create(piParams, {
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
  // 1. If there's a linked stripe_purchase, use its stripe_customer_id directly
  if (plan.stripe_purchase_id) {
    try {
      const { getStripePurchaseById } = require("./_lib/supabase");
      const purchase = await getStripePurchaseById(config, plan.stripe_purchase_id);
      if (purchase && purchase.stripe_customer_id) {
        return purchase.stripe_customer_id;
      }
    } catch (_) { /* fallback below */ }
  }

  // 2. Find the most recent paid purchase for this identity to get customer_id
  if (plan.identity_id) {
    try {
      const { getStripePurchasesForIdentity } = require("./_lib/supabase");
      const purchases = await getStripePurchasesForIdentity(config, plan.identity_id);
      const withCustomer = Array.isArray(purchases)
        ? purchases.find((p) => p.stripe_customer_id)
        : null;
      if (withCustomer) {
        return withCustomer.stripe_customer_id;
      }
    } catch (_) { /* fallback below */ }
  }

  // 3. Search Stripe for customer matching the identity metadata
  if (plan.identity_id) {
    try {
      const customers = await stripe.customers.search({
        query: `metadata["identity_id"]:"${plan.identity_id}"`,
        limit: 1
      });
      if (customers && customers.data && customers.data[0]) {
        return customers.data[0].id;
      }
    } catch (_) { /* search not available */ }
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

// Revoke access for purchases whose grace period has expired (run alongside charge processing)
async function enforceExpiredGracePeriods(config) {
  let revoked = 0;
  try {
    const expired = await listExpiredGracePeriodPurchases(config);
    for (const purchase of expired) {
      await updateStripePurchaseById(config, purchase.id, {
        expires_at: new Date().toISOString()
      });
      // Pause strength instances if subscription-based
      if (purchase.stripe_subscription_id) {
        try {
          await pauseInstancesByStripeSubscription(config, purchase.stripe_subscription_id);
        } catch (_) { /* non-fatal */ }
      }
      revoked += 1;
    }
  } catch (err) {
    console.error("[scheduled-charge-processor] Grace period enforcement error:", err.message || err);
  }
  return revoked;
}

exports.handler = async (event) => {
  try {
    const config = getConfig();
    const stripe = getStripeClient(config);
    const today = new Date().toISOString().slice(0, 10);

    // Enforce expired grace periods first
    const gracePeriodRevoked = await enforceExpiredGracePeriods(config);

    const dueCharges = await listDuePaymentCharges(config, { beforeDate: today });

    if (!dueCharges.length) {
      return json(200, { processed: 0, message: "No charges due", gracePeriodRevoked });
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
      gracePeriodRevoked
    });
  } catch (err) {
    return json(500, { error: err.message || "Scheduler error" });
  }
};
