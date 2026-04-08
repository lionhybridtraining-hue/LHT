const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { archiveAthlete } = require("./_lib/supabase");

function mapAthlete(row) {
  return {
    id: row.id,
    identityId: row.identity_id,
    email: row.email,
    name: row.name,
    status: row.funnel_stage === "archived" ? "archived" : "active",
    coachIdentityId: row.coach_identity_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.onboarding_updated_at || null
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "PATCH") {
    return json(405, { error: "Method not allowed. Use PATCH to archive athlete." });
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
    const confirmArchive = payload.confirmArchive === true || payload.confirmArchive === "true";

    if (!confirmArchive) {
      return json(400, { error: "confirmArchive must be true to archive an athlete" });
    }

    const archived = await archiveAthlete(config, athleteId);

    if (!archived) {
      return json(404, { error: "Athlete not found" });
    }

    return json(200, {
      athlete: mapAthlete(archived),
      message: "Atleta arquivado com sucesso"
    });
  } catch (err) {
    const status = Number(err && err.status);
    if (status >= 400 && status < 500) {
      return json(status, { error: err.message || "Erro de validacao" });
    }
    console.error("[admin-archive-athlete] Unhandled error:", err.message || err);
    return json(500, { error: err.message || "Erro ao arquivar atleta" });
  }
};
