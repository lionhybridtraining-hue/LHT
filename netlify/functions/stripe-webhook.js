const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const {
  getStripeClient,
  normalizeStripeError,
  toIsoFromUnix,
  toStripePurchaseRecord,
  toPaymentIntentPurchaseRecord
} = require("./_lib/stripe");
const {
  upsertStripePurchaseBySessionId,
  upsertStripePurchaseByPaymentIntentId,
  updateStripePurchasesBySubscriptionId,
  updateStripePurchasesByPaymentIntentId,
  getTrainingProgramById,
  getAthleteByIdentity,
  upsertAthleteByIdentity,
  listStrengthPlans,
  getStrengthInstanceByStripePurchaseId,
  createStrengthPlanInstance,
  getStrengthPlanFull,
  pauseInstancesByStripeSubscription,
  resumeInstancesByStripeSubscription,
  createProgramAssignment,
  getActiveLikeProgramAssignment,
  getCoachByIdentityId,
  setAthleteCoachIdentity,
  createAdminNotification,
  upsertCentralLead,
  getPaymentChargeByStripePI,
  updatePaymentCharge,
  getPaymentPlanCharges,
  updatePaymentPlan
} = require("./_lib/supabase");
const { sendCAPIEvent, buildUserData } = require("./_lib/meta-capi");

async function sendGaPurchase({ measurementId, apiSecret, transactionId, value, currency, items }) {
  if (!measurementId || !apiSecret) return { ok: false, reason: "missing_ga_config" };

  const endpoint = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const payload = {
    client_id: "server-webhook",
    events: [{
      name: "purchase",
      params: {
        transaction_id: transactionId,
        value: Number(value || 0),
        currency: (currency || "EUR").toUpperCase(),
        items: items && items.length ? items : [{ item_id: "purchase", item_name: "LHT Program" }]
      }
    }]
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { ok: response.ok, status: response.status };
}

function buildGaItems(program) {
  if (!program) {
    return [{ item_id: "purchase", item_name: "LHT Program" }];
  }

  return [{
    item_id: program.external_id || program.id,
    item_name: program.name
  }];
}

async function buildPlanSnapshot(config, planId) {
  try {
    const full = await getStrengthPlanFull(config, planId);
    if (!full) return null;
    return {
      exercises: full.exercises,
      prescriptions: full.prescriptions,
      phaseNotes: full.phaseNotes || []
    };
  } catch (_) {
    return null;
  }
}

async function handleCheckoutCompleted(config, stripe, session) {
  const identityId = typeof session.client_reference_id === "string" && session.client_reference_id
    ? session.client_reference_id
    : session.metadata && typeof session.metadata.identity_id === "string"
      ? session.metadata.identity_id
      : "";
  const programId = session.metadata && typeof session.metadata.program_id === "string"
    ? session.metadata.program_id
    : "";

  if (!identityId || !programId) {
    return { persisted: false, reason: "missing_identity_or_program_metadata" };
  }

  const program = await getTrainingProgramById(config, programId);
  if (!program) {
    return { persisted: false, reason: "program_not_found" };
  }

  const subscription = typeof session.subscription === "string"
    ? await stripe.subscriptions.retrieve(session.subscription)
    : null;
  const purchase = toStripePurchaseRecord({
    session,
    identityId,
    programId: program.id,
    billingType: program.billing_type,
    fallbackEmail: session.customer_details && session.customer_details.email,
    source: "stripe",
    subscription
  });

  const record = await upsertStripePurchaseBySessionId(config, purchase);

  // Mirror Stripe conversions into the central lead funnel.
  try {
    await upsertCentralLead(config, {
      identityId,
      email: (session.customer_details && session.customer_details.email) || purchase.email || null,
      fullName: (session.customer_details && session.customer_details.name) || null,
      funnelStage: "converted",
      leadStatus: "converted",
      lastActivityType: "purchase_completed",
      lastActivityAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("[stripe-webhook] Failed to upsert central lead conversion:", err.message || err);
  }

  // Auto-provision program assignment for the purchase.
  let autoAssignment = null;
  if (record && record.id) {
    autoAssignment = await ensureAssignmentForPurchase(config, {
      identityId,
      email: (session.customer_details && session.customer_details.email) || record.email || null,
      program,
      purchase: record
    });
  }

  // Auto-provision strength instance for purchases with linked templates.
  let autoInstance = null;
  if (record && record.id) {
    autoInstance = await ensureStrengthInstanceForPurchase(config, {
      identityId,
      email: (session.customer_details && session.customer_details.email) || record.email || null,
      program,
      purchase: record,
      assignmentId: autoAssignment && autoAssignment.assignment ? autoAssignment.assignment.id : null
    });
  }

  return {
    persisted: true,
    record,
    program,
    autoAssignment,
    autoInstance
  };
}

async function ensureAssignmentForPurchase(config, { identityId, email, program, purchase }) {
  if (!identityId || !program || !program.id) {
    return { created: false, reason: "missing_context", assignment: null };
  }

  let athlete = await getAthleteByIdentity(config, identityId);
  if (!athlete && email) {
    athlete = await upsertAthleteByIdentity(config, { identityId, email, name: email });
  }
  if (!athlete) {
    return { created: false, reason: "athlete_not_found", assignment: null };
  }

  const existing = await getActiveLikeProgramAssignment(config, athlete.id, program.id);
  if (existing) {
    return { created: false, reason: "already_assigned", assignment: existing };
  }

  // Resolve default coach from program
  const defaultCoachIdentityId = program.default_coach_identity_id || null;
  let coachId = null;
  if (defaultCoachIdentityId) {
    try {
      const coach = await getCoachByIdentityId(config, defaultCoachIdentityId);
      coachId = coach ? coach.id : null;
    } catch (_) {
      // non-fatal: assignment still created without coach
    }
  }

  // Auto-assign coach to athlete if program declares one
  let coachReplaced = false;
  const previousCoachIdentityId = athlete.coach_identity_id || null;
  if (defaultCoachIdentityId && previousCoachIdentityId !== defaultCoachIdentityId) {
    coachReplaced = Boolean(previousCoachIdentityId); // true only if replacing an existing coach
    try {
      await setAthleteCoachIdentity(config, athlete.id, defaultCoachIdentityId);
    } catch (err) {
      console.error("[stripe-webhook] Failed to set athlete coach_identity_id:", err.message || err);
    }
  }

  const durationWeeks = program.duration_weeks || 12;
  const startDate = new Date().toISOString().slice(0, 10);

  const assignment = await createProgramAssignment(config, {
    athlete_id: athlete.id,
    coach_id: coachId,
    training_program_id: program.id,
    start_date: startDate,
    duration_weeks: durationWeeks,
    status: "active",
    price_cents_snapshot: purchase.price_cents || 0,
    currency_snapshot: purchase.currency || "EUR",
    followup_type_snapshot: "standard",
    notes: `Auto-created from Stripe purchase ${purchase.id}`
  });

  // Notify admin if a coach was automatically replaced
  if (coachReplaced && assignment) {
    try {
      await createAdminNotification(config, {
        type: "coach_auto_replaced",
        severity: "warning",
        title: "Coach substituído automaticamente",
        message: `Atleta ${athlete.name || athlete.email || athlete.id} foi reatribuído ao coach do programa "${program.name}" após nova compra. Coach anterior: ${previousCoachIdentityId}.`,
        athleteId: athlete.id,
        metadata: {
          programId: program.id,
          programName: program.name,
          newCoachIdentityId: defaultCoachIdentityId,
          previousCoachIdentityId,
          assignmentId: assignment.id,
          purchaseId: purchase.id
        }
      });
    } catch (err) {
      console.error("[stripe-webhook] Failed to create admin notification:", err.message || err);
    }
  }

  return {
    created: Boolean(assignment),
    reason: assignment ? "created" : "create_failed",
    assignment: assignment || null,
    coachAutoSet: Boolean(defaultCoachIdentityId && coachId),
    coachReplaced
  };
}

async function ensureStrengthInstanceForPurchase(config, { identityId, email, program, purchase, assignmentId }) {
  if (!identityId || !program || !purchase || !purchase.id) {
    return { created: false, reason: "missing_context", instance: null };
  }

  const existingByPurchase = await getStrengthInstanceByStripePurchaseId(config, purchase.id);
  if (existingByPurchase) {
    return { created: false, reason: "already_exists_for_purchase", instance: existingByPurchase };
  }

  const plans = await listStrengthPlans(config, { trainingProgramId: program.id });
  const template = Array.isArray(plans)
    ? (plans.find((p) => p.status === "active") || plans[0] || null)
    : null;
  if (!template) {
    return { created: false, reason: "no_strength_template_for_program", instance: null };
  }

  let athlete = await getAthleteByIdentity(config, identityId);
  if (!athlete && email) {
    athlete = await upsertAthleteByIdentity(config, {
      identityId,
      email,
      name: email
    });
  }
  if (!athlete) {
    return { created: false, reason: "athlete_not_found", instance: null };
  }

  const planSnapshot = await buildPlanSnapshot(config, template.id);

  const instance = await createStrengthPlanInstance(config, {
    plan_id: template.id,
    athlete_id: athlete.id,
    start_date: null,
    load_round: 2.5,
    status: "active",
    assigned_by: identityId,
    access_model: program.access_model || null,
    stripe_purchase_id: purchase.id,
    program_assignment_id: assignmentId || null,
    coach_locked_until: null,
    plan_snapshot: planSnapshot ? JSON.stringify(planSnapshot) : null
  });

  return {
    created: Boolean(instance),
    reason: instance ? "created" : "create_failed",
    instance: instance || null
  };
}

async function handlePaymentIntentSucceeded(config, stripe, paymentIntent) {
  const metadata = paymentIntent && paymentIntent.metadata ? paymentIntent.metadata : {};
  const identityId = typeof metadata.identity_id === "string" ? metadata.identity_id : "";
  const programId = typeof metadata.program_id === "string" ? metadata.program_id : "";
  if (!identityId || !programId) {
    return { persisted: false, reason: "missing_identity_or_program_metadata" };
  }

  const program = await getTrainingProgramById(config, programId);
  if (!program) {
    return { persisted: false, reason: "program_not_found" };
  }

  let subscriptionId = typeof metadata.subscription_id === "string" && metadata.subscription_id
    ? metadata.subscription_id
    : null;
  let expiresAt = null;
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription && Number.isFinite(subscription.current_period_end)) {
      expiresAt = toIsoFromUnix(subscription.current_period_end);
    }
  }

  const purchase = toPaymentIntentPurchaseRecord({
    paymentIntent,
    identityId,
    programId: program.id,
    billingType: metadata.billing_type || program.billing_type,
    email: metadata.email || null,
    source: "stripe_elements",
    subscriptionId,
    expiresAt
  });

  const record = await upsertStripePurchaseByPaymentIntentId(config, purchase);

  let autoAssignment = null;
  if (record && record.id) {
    autoAssignment = await ensureAssignmentForPurchase(config, {
      identityId,
      email: metadata.email || record.email || null,
      program,
      purchase: record
    });
  }

  let autoInstance = null;
  if (record && record.id) {
    autoInstance = await ensureStrengthInstanceForPurchase(config, {
      identityId,
      email: metadata.email || record.email || null,
      program,
      purchase: record,
      assignmentId: autoAssignment && autoAssignment.assignment ? autoAssignment.assignment.id : null
    });
  }

  return {
    persisted: true,
    record,
    program,
    autoAssignment,
    autoInstance
  };
}

function extractInvoicePeriodEnd(invoice) {
  const firstLine = invoice && invoice.lines && Array.isArray(invoice.lines.data) ? invoice.lines.data[0] : null;
  if (firstLine && firstLine.period && Number.isFinite(firstLine.period.end)) {
    return toIsoFromUnix(firstLine.period.end);
  }
  if (Number.isFinite(invoice.period_end)) {
    return toIsoFromUnix(invoice.period_end);
  }
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    if (!config.stripeWebhookSecret) {
      return json(500, { error: "Missing STRIPE_WEBHOOK_SECRET" });
    }

    const stripe = getStripeClient(config);
    const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
    if (!signature) {
      return json(400, { error: "Missing Stripe-Signature header" });
    }

    const payload = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");
    const stripeEvent = stripe.webhooks.constructEvent(payload, signature, config.stripeWebhookSecret);

    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;
      const result = await handleCheckoutCompleted(config, stripe, session);
      let ga = null;
      let capi = null;
      if (result.persisted && result.record) {
        ga = await sendGaPurchase({
          measurementId: process.env.GA_MEASUREMENT_ID,
          apiSecret: process.env.GA_API_SECRET,
          transactionId: result.record.stripe_session_id || result.record.id,
          value: (result.record.amount_cents || 0) / 100,
          currency: result.record.currency,
          items: buildGaItems(result.program)
        });

        // Meta Conversions API — Purchase event
        const meta = session.metadata || {};
        const customerEmail = session.customer_details && session.customer_details.email;
        const customerPhone = session.customer_details && session.customer_details.phone;
        capi = await sendCAPIEvent(config, {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: `purchase_${session.id}`,
          event_source_url: meta.event_source_url || `${config.siteUrl}/programas.html`,
          action_source: "website",
          user_data: buildUserData({
            email: customerEmail,
            phone: customerPhone,
            fbp: meta.fbp || undefined,
            fbc: meta.fbc || undefined
          }),
          custom_data: {
            value: (result.record.amount_cents || 0) / 100,
            currency: (result.record.currency || "EUR").toUpperCase(),
            content_ids: [result.program ? (result.program.external_id || result.program.id) : "purchase"],
            content_type: "product"
          }
        });
      }
      return json(200, { received: true, type: stripeEvent.type, result, ga, capi: capi ? { ok: capi.ok } : null });
    }

    if (stripeEvent.type === "payment_intent.succeeded") {
      const paymentIntent = stripeEvent.data.object;
      const result = await handlePaymentIntentSucceeded(config, stripe, paymentIntent);
      let ga = null;
      let capi = null;

      if (result.persisted && result.record) {
        ga = await sendGaPurchase({
          measurementId: process.env.GA_MEASUREMENT_ID,
          apiSecret: process.env.GA_API_SECRET,
          transactionId: result.record.stripe_payment_intent_id || result.record.id,
          value: (result.record.amount_cents || 0) / 100,
          currency: result.record.currency,
          items: buildGaItems(result.program)
        });

        const meta = paymentIntent.metadata || {};
        capi = await sendCAPIEvent(config, {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: `purchase_${paymentIntent.id}`,
          event_source_url: meta.event_source_url || `${config.siteUrl}/programas.html`,
          action_source: "website",
          user_data: buildUserData({
            email: meta.email || undefined,
            fbp: meta.fbp || undefined,
            fbc: meta.fbc || undefined
          }),
          custom_data: {
            value: (result.record.amount_cents || 0) / 100,
            currency: (result.record.currency || "EUR").toUpperCase(),
            content_ids: [result.program ? (result.program.external_id || result.program.id) : "purchase"],
            content_type: "product"
          }
        });
      }

      return json(200, { received: true, type: stripeEvent.type, result, ga, capi: capi ? { ok: capi.ok } : null });
    }

    if (stripeEvent.type === "invoice.paid") {
      const invoice = stripeEvent.data.object;
      if (invoice.subscription) {
        const updated = await updateStripePurchasesBySubscriptionId(config, invoice.subscription, {
          status: "paid",
          paid_at: new Date().toISOString(),
          expires_at: extractInvoicePeriodEnd(invoice),
          grace_period_ends_at: null
        });
        // Resume coached_recurring instances that were paused due to payment failure
        const resumed = await resumeInstancesByStripeSubscription(config, invoice.subscription);
        return json(200, { received: true, type: stripeEvent.type, updated: updated.length, resumed: resumed.length });
      }
    }

    if (stripeEvent.type === "invoice.payment_failed") {
      const invoice = stripeEvent.data.object;
      if (invoice.subscription) {
        // Set grace period (7 days) — do NOT pause instances yet
        const gracePeriodEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const updated = await updateStripePurchasesBySubscriptionId(config, invoice.subscription, {
          status: "payment_failed",
          grace_period_ends_at: gracePeriodEndsAt
        });
        return json(200, { received: true, type: stripeEvent.type, updated: updated.length, gracePeriodEndsAt });
      }
    }

    if (stripeEvent.type === "customer.subscription.deleted") {
      const subscription = stripeEvent.data.object;
      const updated = await updateStripePurchasesBySubscriptionId(config, subscription.id, {
        status: "cancelled",
        expires_at: new Date().toISOString()
      });
      // Pause coached_recurring strength instances linked to this subscription
      const paused = await pauseInstancesByStripeSubscription(config, subscription.id);
      return json(200, { received: true, type: stripeEvent.type, updated: updated.length, paused: paused.length });
    }

    if (stripeEvent.type === "charge.refunded") {
      const charge = stripeEvent.data.object;
      if (charge.payment_intent) {
        const updated = await updateStripePurchasesByPaymentIntentId(config, charge.payment_intent, {
          status: "refunded",
          expires_at: new Date().toISOString()
        });
        return json(200, { received: true, type: stripeEvent.type, updated: updated.length });
      }
    }

    if (stripeEvent.type === "checkout.session.expired") {
      const session = stripeEvent.data.object;
      const identityId = typeof session.client_reference_id === "string" && session.client_reference_id
        ? session.client_reference_id
        : session.metadata && typeof session.metadata.identity_id === "string"
          ? session.metadata.identity_id
          : "";
      const programId = session.metadata && typeof session.metadata.program_id === "string"
        ? session.metadata.program_id
        : "";

      if (!identityId || !programId) {
        return json(200, { received: true, type: stripeEvent.type, persisted: false, reason: "missing_identity_or_program" });
      }

      const abandoned = toStripePurchaseRecord({
        session,
        identityId,
        programId,
        billingType: session.metadata && session.metadata.billing_type ? session.metadata.billing_type : "one_time",
        fallbackEmail: session.customer_details && session.customer_details.email ? session.customer_details.email : null,
        source: "stripe",
        subscription: null
      });
      abandoned.status = "abandoned";
      abandoned.paid_at = null;

      const record = await upsertStripePurchaseBySessionId(config, abandoned);
      return json(200, { received: true, type: stripeEvent.type, persisted: true, record });
    }

    // ── Phased payment charge reconciliation ──
    // Catches payment_intent events for charges created by the scheduler
    if (stripeEvent.type === "payment_intent.succeeded" || stripeEvent.type === "payment_intent.payment_failed") {
      const pi = stripeEvent.data.object;
      const chargeId = pi.metadata && pi.metadata.charge_id;
      if (chargeId) {
        const charge = await getPaymentChargeByStripePI(config, pi.id);
        if (charge) {
          if (stripeEvent.type === "payment_intent.succeeded" && charge.status !== "paid") {
            await updatePaymentCharge(config, charge.id, {
              status: "paid",
              stripe_payment_intent_id: pi.id,
              stripe_charge_id: pi.latest_charge || null,
              paid_at: new Date().toISOString(),
              failure_reason: null,
              grace_period_ends_at: null
            });
            // Check plan completion
            const planCharges = await getPaymentPlanCharges(config, charge.payment_plan_id);
            const allDone = planCharges.every((c) =>
              c.status === "paid" || c.status === "skipped" || c.status === "cancelled"
            );
            if (allDone) {
              await updatePaymentPlan(config, charge.payment_plan_id, { status: "completed" });
            }
            return json(200, { received: true, type: stripeEvent.type, chargeReconciled: true, chargeId: charge.id, status: "paid" });
          }
          if (stripeEvent.type === "payment_intent.payment_failed" && charge.status !== "paid") {
            await updatePaymentCharge(config, charge.id, {
              status: "failed",
              stripe_payment_intent_id: pi.id,
              failure_reason: (pi.last_payment_error && pi.last_payment_error.message) || "payment_failed",
              failed_at: new Date().toISOString()
            });
            return json(200, { received: true, type: stripeEvent.type, chargeReconciled: true, chargeId: charge.id, status: "failed" });
          }
        }
        // charge_id in metadata but not found in our ledger — proceed to normal handling
      }
    }

    return json(200, { received: true, ignored_type: stripeEvent.type });
  } catch (error) {
    return json(400, { error: normalizeStripeError(error) });
  }
};
