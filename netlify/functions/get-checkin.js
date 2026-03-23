const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getWeeklyCheckinDetail, verifyCoachOwnsAthlete } = require("./_lib/supabase");
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

    const checkinId = event.queryStringParameters && event.queryStringParameters.checkinId
      ? event.queryStringParameters.checkinId
      : "";

    if (!checkinId) {
      return json(400, { error: "Missing checkinId" });
    }

    const checkin = await getWeeklyCheckinDetail(config, checkinId);
    if (!checkin) {
      return json(404, { error: "Check-in nao encontrado" });
    }

    const owns = await verifyCoachOwnsAthlete(config, user.sub, checkin.athlete_id);
    if (!owns) {
      return json(403, { error: "Acesso negado ao atleta" });
    }

    return json(200, { checkin });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao obter check-in" });
  }
};
