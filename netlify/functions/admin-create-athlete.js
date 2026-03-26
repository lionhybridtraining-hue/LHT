const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { inviteAuthUser, createAthlete, createAthleteForCoach } = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const payload = parseJsonBody(event);
    const email = (payload.email || "").trim().toLowerCase();
    const name = (payload.name || "").trim();
    const coachIdentityId = (payload.coachIdentityId || "").trim();

    if (!email) return json(400, { error: "email e obrigatorio" });
    if (!name) return json(400, { error: "nome e obrigatorio" });

    // Create athlete DB record (with or without coach assignment)
    let athlete;
    if (coachIdentityId) {
      athlete = await createAthleteForCoach(config, coachIdentityId, { name, email });
    } else {
      athlete = await createAthlete(config, { name, email });
    }

    if (!athlete) {
      throw new Error("Falha ao criar atleta na base de dados");
    }

    // Send invite email via Supabase Auth (creates auth user + sends magic link)
    // If the user already exists, skip silently — they can still log in via Google OAuth
    let inviteEmailSent = false;
    try {
      await inviteAuthUser(config, email, { created_by_admin: true });
      inviteEmailSent = true;
    } catch (inviteErr) {
      const msg = String((inviteErr && inviteErr.message) || "");
      const alreadyExists = msg.toLowerCase().includes("already") ||
        msg.toLowerCase().includes("registered") ||
        msg.toLowerCase().includes("exists");
      if (!alreadyExists) {
        // Log but don't fail — athlete record was already created
        console.error("Invite email error:", msg);
      }
    }

    return json(201, {
      athlete: {
        id: athlete.id,
        name: athlete.name || "",
        email: athlete.email || "",
        label: athlete.name || athlete.email || athlete.id
      },
      inviteEmailSent
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao criar atleta" });
  }
};
