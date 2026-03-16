const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { listWeeklyCheckinsByAthlete } = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const athleteId = event.queryStringParameters && event.queryStringParameters.athleteId
      ? event.queryStringParameters.athleteId
      : "";

    if (!athleteId) {
      return json(400, { error: "Missing athleteId" });
    }

    const config = getConfig();
    const rows = await listWeeklyCheckinsByAthlete(config, athleteId);
    const checkins = (Array.isArray(rows) ? rows : []).map((item) => ({
      ...item,
      checkinUrl: item.token
        ? `${config.siteUrl.replace(/\/$/, "")}/check-in/?token=${item.token}`
        : null
    }));

    return json(200, { checkins });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao listar check-ins" });
  }
};
