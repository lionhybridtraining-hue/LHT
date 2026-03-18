const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listCoaches, createCoach, assignRoleToIdentity } = require("./_lib/supabase");

function normalizeCoachPayload(payload) {
  const identityId = (payload.identityId || "").toString().trim();
  const email = (payload.email || "").toString().trim().toLowerCase();
  const name = (payload.name || "").toString().trim();
  const timezone = (payload.timezone || "Europe/Lisbon").toString().trim() || "Europe/Lisbon";
  const defaultFollowupType = (payload.followupType || payload.defaultFollowupType || "standard").toString().trim() || "standard";

  const capacityRaw = payload.capacityLimit;
  const capacityLimit = capacityRaw == null || capacityRaw === "" ? null : Number(capacityRaw);

  if (!identityId) throw new Error("identityId is required");
  if (!email) throw new Error("email is required");
  if (!name) throw new Error("name is required");
  if (capacityLimit != null && (!Number.isInteger(capacityLimit) || capacityLimit < 0)) {
    throw new Error("capacityLimit must be a non-negative integer");
  }

  return {
    identity_id: identityId,
    email,
    name,
    timezone,
    capacity_limit: capacityLimit,
    default_followup_type: defaultFollowupType,
    status: "active"
  };
}

function mapCoach(row) {
  return {
    id: row.id,
    identityId: row.identity_id,
    email: row.email,
    name: row.name,
    timezone: row.timezone,
    capacityLimit: row.capacity_limit,
    followupType: row.default_followup_type,
    status: row.status,
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
      const rows = await listCoaches(config);
      return json(200, { coaches: Array.isArray(rows) ? rows.map(mapCoach) : [] });
    }

    const payload = parseJsonBody(event);
    const normalized = normalizeCoachPayload(payload);
    const created = await createCoach(config, normalized);
    await assignRoleToIdentity(config, normalized.identity_id, "coach");

    return json(201, { coach: mapCoach(created) });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao gerir coaches" });
  }
};
