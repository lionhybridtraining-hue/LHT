const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { resolveProgram } = require("./_lib/program-access");
const { getStripeClient, normalizeStripeError } = require("./_lib/stripe");
const { sendCAPIEvent, buildUserData } = require("./_lib/meta-capi");

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

    // Extract Meta cookies for Conversions API deduplication
    const cookies = event.headers.cookie || event.headers.Cookie || "";
    const fbpMatch = cookies.match(/(?:^|;\s*)_fbp=([^;]+)/);
    const fbcMatch = cookies.match(/(?:^|;\s*)_fbc=([^;]+)/);

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
        billing_type: program.billing_type || "one_time",
        fbp: fbpMatch ? fbpMatch[1] : "",
        fbc: fbcMatch ? fbcMatch[1] : "",
        event_source_url: body.event_source_url || ""
      },
      success_url: successUrl,
      cancel_url: cancelUrl
    }, {
      idempotencyKey: `checkout_${auth.user.sub}_${program.id}_${Date.now()}`
    });

    // ── CAPI: send InitiateCheckout event server-side ─────────────────────
    if (config.metaCapiAccessToken && config.metaDatasetId) {
      try {
        const priceCents = program.price_cents || 0;
        await sendCAPIEvent(config, {
          event_name: "InitiateCheckout",
          event_time: Math.floor(Date.now() / 1000),
          event_id: `checkout_${session.id}`,
          action_source: "website",
          event_source_url: body.event_source_url || `${config.siteUrl}/programas.html`,
          user_data: buildUserData({
            email: auth.user.email,
            fbp: fbpMatch ? fbpMatch[1] : undefined,
            fbc: fbcMatch ? fbcMatch[1] : undefined,
            clientIpAddress: (event.headers["x-forwarded-for"] || event.headers["x-nf-client-connection-ip"] || "").split(",")[0].trim() || undefined,
            clientUserAgent: event.headers["user-agent"] || undefined
          }),
          custom_data: {
            value: priceCents / 100,
            currency: (program.currency || "EUR").toUpperCase(),
            content_ids: [program.external_id || program.id],
            content_type: "product",
            content_name: program.name
          }
        });
        console.log(`create-checkout: CAPI InitiateCheckout sent for session ${session.id}`);
      } catch (err) {
        console.error("create-checkout: CAPI InitiateCheckout failed:", err.message);
      }
    }

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