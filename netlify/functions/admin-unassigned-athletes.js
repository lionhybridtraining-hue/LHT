const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-identity");
const { listUnassignedAthletes } = require("./_lib/supabase");

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

    const athletes = await listUnassignedAthletes(config);
    const normalized = Array.isArray(athletes)
      ? athletes.map((athlete) => ({
          id: athlete.id,
          name: athlete.name || "",
          email: athlete.email || "",
          createdAt: athlete.created_at || null
        }))
      : [];

    return json(200, { athletes: normalized });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao listar atletas sem coach" });
  }
};