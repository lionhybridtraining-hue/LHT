const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { getStripeClient, createPaymentLink, normalizeStripeError } = require("./_lib/stripe");
const { getTrainingProgramById, updateTrainingProgram } = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const stripe = getStripeClient(config);
    const body = parseJsonBody(event);
    const programId = (body.program_id || "").toString().trim();

    if (!programId) {
      return json(400, { error: "program_id e obrigatorio" });
    }

    const program = await getTrainingProgramById(config, programId);
    if (!program) {
      return json(404, { error: "Programa nao encontrado" });
    }

    if (!program.stripe_price_id) {
      return json(400, { error: "Programa sem Stripe Price configurado. Cria primeiro o produto/preco." });
    }

    const link = await createPaymentLink({
      priceId: program.stripe_price_id,
      metadata: { program_id: program.id, program_name: program.name }
    });

    return json(200, {
      ok: true,
      paymentLink: {
        id: link.id,
        url: link.url,
        active: link.active
      }
    });
  } catch (err) {
    return json(500, { error: normalizeStripeError(err) });
  }
};
