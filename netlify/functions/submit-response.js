const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");
const {
  getWeeklyCheckinByToken,
  getWeeklyCheckinById,
  updateWeeklyCheckin,
  getAthleteById,
  getAthleteByIdentity
} = require("./_lib/supabase");
const { generateCoachDraft } = require("./_lib/ai");

function isExpired(timestamp) {
  if (!timestamp) return false;
  return new Date(timestamp).getTime() < Date.now();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const payload = parseJsonBody(event);
    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    const checkinId = typeof payload.checkinId === "string" ? payload.checkinId.trim() : "";
    const answers = payload.answers;

    if ((!token && !checkinId) || !answers || typeof answers !== "object") {
      return json(400, { error: "Missing token/checkinId or answers" });
    }

    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);
    const authenticatedAthlete = user ? await getAthleteByIdentity(config, user.sub) : null;
    const checkin = token
      ? await getWeeklyCheckinByToken(config, token)
      : await getWeeklyCheckinById(config, checkinId);
    if (!checkin) {
      return json(404, { error: "Check-in nao encontrado" });
    }

    const isAuthenticatedOwner = Boolean(
      authenticatedAthlete && authenticatedAthlete.id === checkin.athlete_id
    );

    if (!token && !isAuthenticatedOwner) {
      return json(403, { error: "Acesso negado ao check-in" });
    }

    if (checkin.approved_at) {
      return json(409, { error: "Check-in ja aprovado" });
    }

    if (token && isExpired(checkin.token_expires_at) && !isAuthenticatedOwner) {
      return json(410, { error: "Link de check-in expirado" });
    }

    const athlete = await getAthleteById(config, checkin.athlete_id);
    const coachDraft = await generateCoachDraft({
      config,
      apiKey: config.geminiApiKey,
      modelName: config.geminiModel,
      athlete,
      checkin,
      answers
    });

    const updated = await updateWeeklyCheckin(config, checkin.id, {
      athlete_answers: answers,
      ai_analysis: {
        alignment: coachDraft.alignment,
        adjustments: coachDraft.adjustments
      },
      final_feedback: coachDraft.final_feedback,
      submitted_via: isAuthenticatedOwner ? "identity" : "token",
      submitted_by_identity_id: isAuthenticatedOwner ? authenticatedAthlete.identity_id : null,
      status: "pending_coach",
      responded_at: new Date().toISOString(),
      token: null
    });

    return json(200, {
      ok: true,
      status: updated ? updated.status : "pending_coach"
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao submeter respostas" });
  }
};
