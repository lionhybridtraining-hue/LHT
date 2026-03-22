const crypto = require("crypto");
const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const {
  getWeeklyCheckinById,
  updateWeeklyCheckin,
  verifyCoachOwnsAthlete
} = require("./_lib/supabase");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");

function addDaysIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);

    if (!user) {
      return json(401, { error: "Authentication required" });
    }

    const payload = parseJsonBody(event);
    const athleteId = (payload.athleteId || "").toString().trim();
    const checkinId = (payload.checkinId || "").toString().trim();

    if (!athleteId || !checkinId) {
      return json(400, { error: "Missing athleteId or checkinId" });
    }

    const owns = await verifyCoachOwnsAthlete(config, user.sub, athleteId);
    if (!owns) {
      return json(403, { error: "Acesso negado ao atleta" });
    }

    const checkin = await getWeeklyCheckinById(config, checkinId);
    if (!checkin || checkin.athlete_id !== athleteId) {
      return json(404, { error: "Check-in nao encontrado" });
    }

    if (checkin.responded_at || checkin.approved_at) {
      return json(409, { error: "Nao e possivel reemitir: check-in ja respondido ou aprovado" });
    }

    const updated = await updateWeeklyCheckin(config, checkin.id, {
      token: crypto.randomUUID(),
      token_expires_at: addDaysIso(7)
    });

    return json(200, {
      ok: true,
      checkinId: updated.id,
      tokenExpiresAt: updated.token_expires_at,
      checkinUrl: `${config.siteUrl.replace(/\/$/, "")}/check-in/?token=${updated.token}`
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao reemitir link" });
  }
};