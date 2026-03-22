const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { resolveProgram } = require("./_lib/program-access");
const { createStripePurchase, getAthleteByEmail } = require("./_lib/supabase");

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const body = parseJsonBody(event);
    const identityId = normalizeString(body.identity_id);
    const email = normalizeString(body.email).toLowerCase();
    const athlete = !identityId && email ? await getAthleteByEmail(config, email) : null;
    const resolvedIdentityId = identityId || (athlete && athlete.identity_id) || "";

    if (!resolvedIdentityId) {
      return json(400, { error: "identity_id ou email com atleta associado e obrigatorio" });
    }

    const program = await resolveProgram(config, {
      programId: body.program_id,
      programExternalId: body.program_external_id
    });
    if (!program) {
      return json(404, { error: "Programa nao encontrado" });
    }

    const now = new Date().toISOString();
    const record = await createStripePurchase(config, {
      stripe_session_id: null,
      stripe_customer_id: null,
      stripe_payment_intent_id: null,
      stripe_subscription_id: null,
      identity_id: resolvedIdentityId,
      program_id: program.id,
      email: email || null,
      amount_cents: Number.isFinite(Number(body.amount_cents)) ? Number(body.amount_cents) : program.price_cents,
      currency: normalizeString(body.currency).toUpperCase() || program.currency,
      billing_type: program.billing_type || "one_time",
      status: "paid",
      source: "admin_override",
      paid_at: now,
      expires_at: normalizeString(body.expires_at) || null
    });

    return json(200, {
      ok: true,
      purchase: record
    });
  } catch (error) {
    return json(500, { error: error.message || "Nao foi possivel conceder acesso" });
  }
};