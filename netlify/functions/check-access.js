const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { getProgramAssociationAccess, resolveProgram } = require("./_lib/program-access");
const {
  getStripeClient,
  normalizeStripeError,
  toStripePurchaseRecord,
  toPaymentIntentPurchaseRecord,
  toIsoFromUnix
} = require("./_lib/stripe");
const {
  upsertStripePurchaseBySessionId,
  upsertStripePurchaseByPaymentIntentId,
  getTrainingProgramById,
  getAthleteByIdentity,
  upsertAthleteByIdentity,
  listStrengthPlans,
  getStrengthInstanceByStripePurchaseId,
  createStrengthPlanInstance,
  getStrengthPlanFull
} = require("./_lib/supabase");

function getQuery(event) {
  return event && event.queryStringParameters ? event.queryStringParameters : {};
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

async function syncFromSession(config, user, sessionId, fallbackProgramId) {
  if (!sessionId) return null;

  const stripe = getStripeClient(config);
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"]
  });

  const sessionIdentityId = typeof session.client_reference_id === "string" && session.client_reference_id
    ? session.client_reference_id
    : session.metadata && typeof session.metadata.identity_id === "string"
      ? session.metadata.identity_id
      : "";

  if (!sessionIdentityId || sessionIdentityId !== user.sub) {
    const error = new Error("Sessao Stripe nao pertence ao utilizador autenticado");
    error.statusCode = 403;
    throw error;
  }

  const programId = session.metadata && typeof session.metadata.program_id === "string" && session.metadata.program_id
    ? session.metadata.program_id
    : fallbackProgramId || "";
  const program = await resolveProgram(config, { programId });
  if (!program) {
    return null;
  }

  const purchase = toStripePurchaseRecord({
    session,
    identityId: user.sub,
    programId: program.id,
    billingType: program.billing_type,
    fallbackEmail: user.email,
    source: "stripe",
    subscription: session.subscription && typeof session.subscription === "object" ? session.subscription : null
  });

  const record = await upsertStripePurchaseBySessionId(config, purchase);

  await ensureStrengthInstanceForPurchase(config, {
    identityId: user.sub,
    email: user.email || session.customer_details?.email || null,
    program,
    purchase: record
  });

  return program;
}

async function syncFromPaymentIntent(config, user, paymentIntentId, fallbackProgramId) {
  if (!paymentIntentId) return null;

  const stripe = getStripeClient(config);
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const metadata = paymentIntent && paymentIntent.metadata ? paymentIntent.metadata : {};

  const identityId = typeof metadata.identity_id === "string" ? metadata.identity_id : "";
  if (!identityId || identityId !== user.sub) {
    const error = new Error("PaymentIntent nao pertence ao utilizador autenticado");
    error.statusCode = 403;
    throw error;
  }

  const programId = typeof metadata.program_id === "string" && metadata.program_id
    ? metadata.program_id
    : (fallbackProgramId || "");
  if (!programId) return null;

  const program = await getTrainingProgramById(config, programId);
  if (!program) return null;

  const subscriptionId = typeof metadata.subscription_id === "string" && metadata.subscription_id
    ? metadata.subscription_id
    : null;
  let expiresAt = null;
  if (subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription && Number.isFinite(subscription.current_period_end)) {
        expiresAt = toIsoFromUnix(subscription.current_period_end);
      }
    } catch (_) {
      // Non-fatal: purchase can still be upserted without expires_at.
    }
  }

  const purchase = toPaymentIntentPurchaseRecord({
    paymentIntent,
    identityId: user.sub,
    programId: program.id,
    billingType: metadata.billing_type || program.billing_type,
    email: metadata.email || user.email || null,
    source: "stripe_elements",
    subscriptionId,
    expiresAt
  });

  const record = await upsertStripePurchaseByPaymentIntentId(config, purchase);

  await ensureStrengthInstanceForPurchase(config, {
    identityId: user.sub,
    email: user.email || metadata.email || null,
    program,
    purchase: record
  });

  return program;
}

async function ensureStrengthInstanceForPurchase(config, { identityId, email, program, purchase }) {
  if (!identityId || !program || !purchase || !purchase.id) return;

  const existing = await getStrengthInstanceByStripePurchaseId(config, purchase.id);
  if (existing) return;

  const plans = await listStrengthPlans(config, { trainingProgramId: program.id });
  const template = Array.isArray(plans)
    ? (plans.find((p) => p.status === "active") || plans[0] || null)
    : null;
  if (!template) return;

  let athlete = await getAthleteByIdentity(config, identityId);
  if (!athlete && email) {
    athlete = await upsertAthleteByIdentity(config, {
      identityId,
      email,
      name: email
    });
  }
  if (!athlete) return;

  const planSnapshot = await buildPlanSnapshot(config, template.id);

  await createStrengthPlanInstance(config, {
    plan_id: template.id,
    athlete_id: athlete.id,
    start_date: null,
    load_round: 2.5,
    status: "active",
    assigned_by: identityId,
    access_model: program.access_model || null,
    stripe_purchase_id: purchase.id,
    program_assignment_id: null,
    coach_locked_until: null,
    plan_snapshot: planSnapshot ? JSON.stringify(planSnapshot) : null
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const query = getQuery(event);
    const requestedProgramId = query.program_id || "";
    const requestedProgramExternalId = query.program_external_id || query.program || "";
    const sessionId = query.session_id || "";
    const paymentIntentId = query.payment_intent || "";

    if (sessionId) {
      await syncFromSession(config, auth.user, sessionId, requestedProgramId);
    }

    if (paymentIntentId) {
      await syncFromPaymentIntent(config, auth.user, paymentIntentId, requestedProgramId);
    }

    const athlete = await getAthleteByIdentity(config, auth.user.sub);

    const access = await getProgramAssociationAccess(config, {
      athleteId: athlete ? athlete.id : null,
      identityId: auth.user.sub,
      programId: requestedProgramId,
      programExternalId: requestedProgramExternalId
    });

    return json(200, {
      ok: true,
      hasAccess: access.hasAccess,
      reason: access.reason,
      message: access.hasAccess ? "Acesso confirmado" : "Pagamento necessario para continuar",
      program: access.program
        ? {
            id: access.program.id,
            externalId: access.program.external_id || null,
            name: access.program.name,
            description: access.program.description || null,
            billingType: access.program.billing_type || "one_time",
            priceCents: access.program.price_cents,
            currency: access.program.currency,
            durationWeeks: access.program.duration_weeks
          }
        : null,
      purchase: access.purchase
        ? {
            id: access.purchase.id,
            status: access.purchase.status,
            paidAt: access.purchase.paid_at || null,
            expiresAt: access.purchase.expires_at || null,
            source: access.purchase.source || null
          }
        : null
    });
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return json(statusCode, { error: normalizeStripeError(error) });
  }
};