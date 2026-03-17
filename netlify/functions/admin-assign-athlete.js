const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-identity");
const { assignUnassignedAthleteToCoach } = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);
    if (!user) {
      return json(401, { error: "Authentication required" });
    }

    const payload = parseJsonBody(event);
    const athleteId = (payload.athleteId || "").toString().trim();
    const coachIdentityId = (payload.coachIdentityId || "").toString().trim();

    if (!athleteId) {
      return json(400, { error: "athleteId is required" });
    }

    if (!coachIdentityId) {
      return json(400, { error: "coachIdentityId is required" });
    }

    const assigned = await assignUnassignedAthleteToCoach(config, athleteId, coachIdentityId);
    if (!assigned) {
      return json(409, { error: "Atleta nao encontrado ou ja atribuido" });
    }

    return json(200, {
      athlete: {
        id: assigned.id,
        name: assigned.name || "",
        email: assigned.email || "",
        coachIdentityId: assigned.coach_identity_id || ""
      }
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao atribuir atleta" });
  }
};