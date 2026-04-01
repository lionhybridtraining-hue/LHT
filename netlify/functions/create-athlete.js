const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { createAthleteForCoach } = require("./_lib/supabase");
const { requireRole } = require("./_lib/authz");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "coach");
    if (auth.error) {
      return auth.error;
    }

    const user = auth.user;
    const coachId = user.sub;
    const payload = parseJsonBody(event);
    const name = (payload.name || "").trim();
    const email = (payload.email || "").trim().toLowerCase();

    if (!email) {
      return json(400, { error: "Email é obrigatório" });
    }

    const created = await createAthleteForCoach(config, coachId, {
      name,
      email
    });

    return json(200, {
      athlete: {
        id: created.id,
        name: created.name || "",
        email: created.email || "",
        label: created.name || created.email || created.id
      }
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao criar atleta" });
  }
};
