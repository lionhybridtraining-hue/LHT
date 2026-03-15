const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getWeeklyCheckinByToken } = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const token = event.queryStringParameters && event.queryStringParameters.token
      ? event.queryStringParameters.token
      : "";

    if (!token) {
      return json(400, { error: "Missing token" });
    }

    const config = getConfig();
    const checkin = await getWeeklyCheckinByToken(config, token);
    if (!checkin) {
      return json(404, { error: "Check-in nao encontrado" });
    }

    return json(200, {
      id: checkin.id,
      weekStart: checkin.week_start,
      status: checkin.status,
      summary: checkin.training_summary,
      questions: checkin.ai_questions || []
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro a carregar check-in" });
  }
};
