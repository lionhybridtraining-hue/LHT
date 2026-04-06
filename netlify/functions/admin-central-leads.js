const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listCentralLeads, updateCentralLead } = require("./_lib/supabase");

const VALID_SOURCES = [
  "planocorrida_landing",
  "planocorrida_form",
  "planocorrida_generated",
  "meta_ads",
  "coach_landing",
  "onboarding",
  "manual"
];

const VALID_FUNNEL_STAGES = [
  "landing",
  "landing_submitted",
  "meta_received",
  "onboarding_submitted",
  "plan_generated",
  "coach_application",
  "qualified",
  "converted",
  "disqualified"
];

const VALID_LEAD_STATUS = ["new", "contacted", "qualified", "converted", "disqualified"];

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function mapLead(row) {
  const profile = row && typeof row.profile === "object" && row.profile ? row.profile : {};
  return {
    id: row.id,
    athleteId: row.athlete_id || null,
    identityId: row.identity_id || null,
    metaLeadId: row.meta_lead_id || null,
    source: row.source || null,
    lastSource: row.last_source || null,
    sourceRefId: row.source_ref_id || null,
    email: row.email || null,
    emailNormalized: row.email_normalized || null,
    phone: row.phone || null,
    phoneNormalized: row.phone_normalized || null,
    fullName: row.full_name || profile.fullName || null,
    funnelStage: row.funnel_stage,
    leadStatus: row.lead_status,
    lastActivityType: row.last_activity_type || null,
    lastActivityAt: row.last_activity_at || null,
    profile,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function countByStage(leads) {
  return leads.reduce((acc, lead) => {
    const key = lead.funnelStage || "landing";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (!["GET", "PATCH"].includes(method)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    if (method === "GET") {
      const query = event.queryStringParameters || {};
      const source = typeof query.source === "string" && query.source.trim() ? query.source.trim() : undefined;
      const funnelStage = typeof query.funnel_stage === "string" && query.funnel_stage.trim() ? query.funnel_stage.trim() : undefined;
      const leadStatus = typeof query.lead_status === "string" && query.lead_status.trim() ? query.lead_status.trim() : undefined;
      const textQuery = typeof query.q === "string" ? query.q.trim() : "";
      const dateFrom = typeof query.date_from === "string" && query.date_from.trim() ? query.date_from.trim() : undefined;
      const dateTo = typeof query.date_to === "string" && query.date_to.trim() ? query.date_to.trim() : undefined;
      const limit = clampInt(query.limit, 100, 1, 250);
      const offset = clampInt(query.offset, 0, 0, 100000);

      if (source && !VALID_SOURCES.includes(source)) {
        return json(400, { error: `source must be one of: ${VALID_SOURCES.join(", ")}` });
      }
      if (funnelStage && !VALID_FUNNEL_STAGES.includes(funnelStage)) {
        return json(400, { error: `funnel_stage must be one of: ${VALID_FUNNEL_STAGES.join(", ")}` });
      }
      if (leadStatus && !VALID_LEAD_STATUS.includes(leadStatus)) {
        return json(400, { error: `lead_status must be one of: ${VALID_LEAD_STATUS.join(", ")}` });
      }

      const rows = await listCentralLeads(config, {
        source,
        funnelStage,
        leadStatus,
        query: textQuery,
        dateFrom,
        dateTo,
        limit,
        offset
      });

      const leads = Array.isArray(rows) ? rows.map(mapLead) : [];
      return json(200, {
        leads,
        filters: {
          source: source || null,
          funnelStage: funnelStage || null,
          leadStatus: leadStatus || null,
          query: textQuery || null,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          limit,
          offset
        },
        countsByStage: countByStage(leads)
      });
    }

    let payload;
    try {
      payload = parseJsonBody(event);
    } catch (err) {
      return json(400, { error: `JSON invalido: ${err.message}` });
    }

    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    const patch = {};

    if (!id) return json(400, { error: "id is required" });

    if (payload.funnelStage !== undefined) {
      if (!VALID_FUNNEL_STAGES.includes(payload.funnelStage)) {
        return json(400, { error: `funnelStage must be one of: ${VALID_FUNNEL_STAGES.join(", ")}` });
      }
      patch.funnel_stage = payload.funnelStage;
    }

    if (payload.leadStatus !== undefined) {
      if (!VALID_LEAD_STATUS.includes(payload.leadStatus)) {
        return json(400, { error: `leadStatus must be one of: ${VALID_LEAD_STATUS.join(", ")}` });
      }
      patch.lead_status = payload.leadStatus;
    }

    if (!Object.keys(patch).length) {
      return json(400, { error: "Nothing to update" });
    }

    const rows = await updateCentralLead(config, id, patch);
    const updated = Array.isArray(rows) && rows.length ? mapLead(rows[0]) : null;
    return json(200, { lead: updated });
  } catch (err) {
    return json(500, { error: err.message || "Erro interno" });
  }
};
