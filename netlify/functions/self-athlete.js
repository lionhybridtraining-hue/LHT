const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");
const { getAthleteByIdentity } = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);

    if (!user || !user.sub) {
      return json(401, { error: "Authentication required" });
    }

    const athlete = await getAthleteByIdentity(config, user.sub);
    if (!athlete) {
      return json(404, { error: "Athlete not found" });
    }

    return json(200, {
      athlete: {
        id: athlete.id,
        identityId: athlete.identity_id || null,
        email: athlete.email || null,
        name: athlete.name || null,
        coachIdentityId: athlete.coach_identity_id || null
      }
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao carregar atleta" });
  }
};
