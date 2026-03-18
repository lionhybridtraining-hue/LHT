const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { listWeeklyCheckinsByAthlete, verifyCoachOwnsAthlete } = require("./_lib/supabase");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");

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
    const athleteId = event.queryStringParameters && event.queryStringParameters.athleteId
      ? event.queryStringParameters.athleteId
      : "";

    if (!athleteId) {
      return json(400, { error: "Missing athleteId" });
    }

    const owns = await verifyCoachOwnsAthlete(config, coachId, athleteId);
    if (!owns) {
      return json(403, { error: "Acesso negado ao atleta" });
    }

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
