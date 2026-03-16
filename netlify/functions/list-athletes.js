const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { listAthletes } = require("./_lib/supabase");
const { getIdentityUser, unauthorized } = require("./_lib/auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const user = getIdentityUser(event);
  if (!user) {
    return unauthorized("missing_identity_user");
  }

  try {
    const config = getConfig();
    const athletes = await listAthletes(config);
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