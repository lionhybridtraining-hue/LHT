const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getWeeklyCheckinByToken, updateWeeklyCheckin, getAthleteById } = require("./_lib/supabase");
const { generateCoachDraft } = require("./_lib/ai");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const payload = parseJsonBody(event);
    const token = payload.token;
    const answers = payload.answers;

    if (!token || !answers || typeof answers !== "object") {
      return json(400, { error: "Missing token or answers" });
    }

    const config = getConfig();
    const checkin = await getWeeklyCheckinByToken(config, token);
    if (!checkin) {
      return json(404, { error: "Check-in nao encontrado" });
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
      status: "pending_coach",
      responded_at: new Date().toISOString()
    });

    return json(200, {
      ok: true,
      status: updated ? updated.status : "pending_coach"
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao submeter respostas" });
  }
};
