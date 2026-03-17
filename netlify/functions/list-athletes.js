const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { listAthletesByCoach } = require("./_lib/supabase");
const { getAuthenticatedUser } = require("./_lib/auth-identity");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);
    
    if (!user) {
      return json(401, { error: "Authentication required" });
    }

    const coachId = user.sub;
    const athletes = await listAthletesByCoach(config, coachId);
    const normalized = Array.isArray(athletes)
      ? athletes
          .map((athlete) => ({
            id: athlete.id,
            name: athlete.name || "",
            email: athlete.email || "",
            label: athlete.name || athlete.email || athlete.id
          }))
          .sort((left, right) => left.label.localeCompare(right.label, "pt"))
      : [];

    return json(200, { athletes: normalized });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao carregar atletas" });
  }
};