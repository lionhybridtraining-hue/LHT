const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { getProgramAccess, resolveProgram } = require("./_lib/program-access");
const { getStripeClient, normalizeStripeError, toStripePurchaseRecord } = require("./_lib/stripe");
const { upsertStripePurchaseBySessionId } = require("./_lib/supabase");

function getQuery(event) {
  return event && event.queryStringParameters ? event.queryStringParameters : {};
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

  await upsertStripePurchaseBySessionId(config, purchase);
  return program;
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

    if (sessionId) {
      await syncFromSession(config, auth.user, sessionId, requestedProgramId);
    }

    const access = await getProgramAccess(config, {
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