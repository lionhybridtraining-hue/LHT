const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { listPublicTrainingPrograms } = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const rows = await listPublicTrainingPrograms(config);
    return json(200, {
      ok: true,
      programs: Array.isArray(rows)
        ? rows.map((program) => ({
            id: program.id,
            externalId: program.external_id || null,
            name: program.name,
            description: program.description || null,
            durationWeeks: program.duration_weeks,
            priceCents: program.price_cents,
            currency: program.currency,
            billingType: program.billing_type || "one_time"
          }))
        : []
    });
  } catch (error) {
    return json(500, { error: error.message || "Nao foi possivel listar programas" });
  }
};