const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { setAthleteCoachIdentity } = require("./_lib/supabase");

function mapAthlete(row) {
  return {
    id: row.id,
    identityId: row.identity_id,
    email: row.email,
    name: row.name,
    status: row.status,
    coachIdentityId: row.coach_identity_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "PATCH") {
    return json(405, { error: "Method not allowed. Use PATCH to update athlete coach." });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const query = event.queryStringParameters || {};
    const athleteId = (query.athleteId || "").toString().trim();

    if (!athleteId) {
      return json(400, { error: "athleteId is required" });
    }

    const payload = parseJsonBody(event);
    const coachIdentityIdRaw = payload.coachIdentityId;
    const coachIdentityId = typeof coachIdentityIdRaw === "string"
      ? coachIdentityIdRaw.trim() || null
      : null;

    const updated = await setAthleteCoachIdentity(config, athleteId, coachIdentityId);

    if (!updated) {
      return json(404, { error: "Athlete not found" });
    }

    return json(200, {
      athlete: mapAthlete(updated),
      message: "Coach atualizado com sucesso"
    });
  } catch (err) {
    const status = Number(err && err.status);
    if (status >= 400 && status < 500) {
      return json(status, { error: err.message || "Erro de validacao" });
    }
    console.error("[admin-update-athlete-coach] Unhandled error:", err.message || err);
    return json(500, { error: err.message || "Erro ao atualizar coach do atleta" });
  }
};
