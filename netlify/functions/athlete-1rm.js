const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  getAthlete1rmLatest,
  get1rmHistory,
  insertAthlete1rm,
  verifyCoachOwnsAthlete
} = require("./_lib/supabase");

function requireCoachOrAdmin(auth) {
  const roles = Array.isArray(auth.roles) ? auth.roles : [];
  return roles.includes("coach") || roles.includes("admin");
}

function isAdminAuth(auth) {
  const roles = Array.isArray(auth.roles) ? auth.roles : [];
  return roles.includes("admin");
}

exports.handler = async (event) => {
  const config = getConfig();
  const auth = await requireAuthenticatedUser(event, config);
  if (auth.error) return auth.error;
  if (!requireCoachOrAdmin(auth)) return json(403, { error: "Forbidden" });

  const isAdmin = isAdminAuth(auth);
  const coachId = auth.user.sub;

  try {
    if (event.httpMethod === "GET") {
      const qs = event.queryStringParameters || {};
      if (!qs.athleteId) return json(400, { error: "athleteId is required" });

      if (!isAdmin) await verifyCoachOwnsAthlete(config, coachId, qs.athleteId);

      // History for a specific exercise
      if (qs.exerciseId) {
        const history = await get1rmHistory(config, qs.athleteId, qs.exerciseId);
        return json(200, { history: history || [] });
      }

      // Latest 1RM for all exercises
      const records = await getAthlete1rmLatest(config, qs.athleteId);
      return json(200, { records });
    }

    // POST — manual 1RM entry
    if (event.httpMethod === "POST") {
      const body = parseJsonBody(event);
      if (!body.athlete_id || !body.exercise_id || body.value_kg == null) {
        return json(400, { error: "athlete_id, exercise_id, value_kg are required" });
      }

      if (!isAdmin) await verifyCoachOwnsAthlete(config, coachId, body.athlete_id);

      const record = await insertAthlete1rm(config, {
        athlete_id: body.athlete_id,
        exercise_id: body.exercise_id,
        value_kg: body.value_kg,
        method: body.method || "manual",
        source: "coach_entry",
        tested_at: body.tested_at || new Date().toISOString().slice(0, 10)
      });
      return json(201, { record });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal server error" });
  }
};
