const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listTrainingPrograms, createTrainingProgram } = require("./_lib/supabase");

function normalizeProgramPayload(payload) {
  const name = (payload.name || "").toString().trim();
  const externalSource = (payload.externalSource || "trainingpeaks").toString().trim().toLowerCase() || "trainingpeaks";
  const externalId = payload.externalId == null ? null : payload.externalId.toString().trim() || null;
  const description = payload.description == null ? null : payload.description.toString();
  const durationWeeks = Number(payload.durationWeeks);
  const priceCents = Number(payload.priceCents ?? 0);
  const currency = (payload.currency || "EUR").toString().trim().toUpperCase() || "EUR";
  const followupType = (payload.followupType || "standard").toString().trim() || "standard";
  const status = (payload.status || "draft").toString().trim().toLowerCase();
  const isScheduledTemplate = Boolean(payload.isScheduledTemplate);

  if (!name) throw new Error("name is required");
  if (!Number.isInteger(durationWeeks) || durationWeeks <= 0) throw new Error("durationWeeks must be a positive integer");
  if (!Number.isInteger(priceCents) || priceCents < 0) throw new Error("priceCents must be a non-negative integer");
  if (!["draft", "active", "archived"].includes(status)) throw new Error("status must be draft, active or archived");

  return {
    name,
    external_source: externalSource,
    external_id: externalId,
    description,
    duration_weeks: durationWeeks,
    price_cents: priceCents,
    currency,
    followup_type: followupType,
    status,
    is_scheduled_template: isScheduledTemplate
  };
}

function mapProgram(row) {
  return {
    id: row.id,
    name: row.name,
    externalSource: row.external_source,
    externalId: row.external_id,
    description: row.description,
    durationWeeks: row.duration_weeks,
    priceCents: row.price_cents,
    currency: row.currency,
    followupType: row.followup_type,
    status: row.status,
    isScheduledTemplate: row.is_scheduled_template,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (!["GET", "POST"].includes(method)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    if (method === "GET") {
      const rows = await listTrainingPrograms(config);
      return json(200, { programs: Array.isArray(rows) ? rows.map(mapProgram) : [] });
    }

    const payload = parseJsonBody(event);
    const normalized = normalizeProgramPayload(payload);
    const created = await createTrainingProgram(config, normalized);

    return json(201, { program: mapProgram(created) });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao gerir programas" });
  }
};
