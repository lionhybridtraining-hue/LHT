const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { resolveProgram } = require("./_lib/program-access");
const { getStripeClient, normalizeStripeError } = require("./_lib/stripe");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const body = parseJsonBody(event);
    const program = await resolveProgram(config, {
      programId: body.program_id,
      programExternalId: body.program_external_id
    });

    if (!program || program.status !== "active") {
      return json(404, { error: "Programa indisponivel" });
    }

    if (!program.stripe_price_id) {
      return json(400, { error: "Programa sem Stripe Price configurado" });
    }

    const stripe = getStripeClient(config);
    const mode = program.billing_type === "recurring" ? "subscription" : "payment";
    const successUrl = `${config.siteUrl}/onboarding?session_id={CHECKOUT_SESSION_ID}&program_id=${encodeURIComponent(program.id)}`;
    const cancelUrl = `${config.siteUrl}/programas.html?program_id=${encodeURIComponent(program.id)}&checkout=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: program.stripe_price_id, quantity: 1 }],
      allow_promotion_codes: true,
      customer_email: auth.user.email || undefined,
      client_reference_id: auth.user.sub,
      metadata: {
        program_id: program.id,
        program_external_id: program.external_id || "",
        identity_id: auth.user.sub,
        billing_type: program.billing_type || "one_time"
      },
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    return json(200, {
      ok: true,
      url: session.url,
      sessionId: session.id,
      program: {
        id: program.id,
        externalId: program.external_id || null,
        name: program.name,
        billingType: program.billing_type,
        priceCents: program.price_cents,
        currency: program.currency
      }
    });
  } catch (error) {
    return json(500, { error: normalizeStripeError(error) });
  }
};