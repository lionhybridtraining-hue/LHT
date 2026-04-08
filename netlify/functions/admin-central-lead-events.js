const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listCentralLeadEvents } = require("./_lib/supabase");

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function mapEvent(row) {
  return {
    id: row.id,
    leadId: row.lead_id || null,
    source: row.source || null,
    eventType: row.event_type || null,
    activityType: row.activity_type || null,
    funnelStage: row.funnel_stage || null,
    leadStatus: row.lead_status || null,
    eventAt: row.event_at || row.created_at || null,
    actor: row.actor || null,
    payload: row && typeof row.payload === "object" && row.payload ? row.payload : {}
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const query = event.queryStringParameters || {};
    const leadId = typeof query.lead_id === "string" ? query.lead_id.trim() : "";
    const limit = clampInt(query.limit, 30, 1, 200);

    if (!leadId) {
      return json(400, { error: "lead_id is required" });
    }

    const rows = await listCentralLeadEvents(config, { leadId, limit });
    const events = Array.isArray(rows) ? rows.map(mapEvent) : [];

    return json(200, {
      leadId,
      limit,
      events
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro interno" });
  }
};
