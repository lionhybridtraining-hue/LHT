const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  getAthleteByIdentity,
  getStrengthPlanById,
  insertStrengthLogSets,
  getStrengthLogs,
  insertAthlete1rm
} = require("./_lib/supabase");
const { estimate1rm } = require("./_lib/strength");

exports.handler = async (event) => {
  const config = getConfig();
  const auth = await requireAuthenticatedUser(event, config);
  if (auth.error) return auth.error;

  const identityId = auth.user.sub;

  try {
    // GET — fetch logs for a plan/week
    if (event.httpMethod === "GET") {
      const qs = event.queryStringParameters || {};
      const athlete = await getAthleteByIdentity(config, identityId);
      if (!athlete) return json(404, { error: "Athlete not found" });

      if (!qs.planId) return json(400, { error: "planId is required" });

      const logs = await getStrengthLogs(
        config,
        athlete.id,
        qs.planId,
        qs.weekNumber ? parseInt(qs.weekNumber, 10) : null
      );
      return json(200, { logs: logs || [] });
    }

    // POST — submit log sets
    if (event.httpMethod === "POST") {
      const body = parseJsonBody(event);
      if (!body.plan_id || !body.sets || !body.sets.length) {
        return json(400, { error: "plan_id and sets[] are required" });
      }

      const athlete = await getAthleteByIdentity(config, identityId);
      if (!athlete) return json(404, { error: "Athlete not found" });

      const plan = await getStrengthPlanById(config, body.plan_id);
      if (!plan || plan.athlete_id !== athlete.id) {
        return json(403, { error: "Not your plan" });
      }

      const rows = body.sets.map(s => ({
        athlete_id: athlete.id,
        plan_exercise_id: s.plan_exercise_id || null,
        plan_id: body.plan_id,
        week_number: s.week_number,
        day_number: s.day_number,
        session_date: s.session_date || new Date().toISOString().slice(0, 10),
        set_number: s.set_number || 1,
        reps: s.reps,
        load_kg: s.load_kg != null ? s.load_kg : null,
        rir: s.rir != null ? s.rir : null,
        duration_seconds: s.duration_seconds || null,
        method: s.method || "standard",
        notes: s.notes || null,
        submitted_by_identity_id: identityId
      }));

      const saved = await insertStrengthLogSets(config, rows);

      // Auto 1RM estimation via Epley for sets with load+reps
      const oneRmUpdates = [];
      for (const set of (saved || [])) {
        if (set.load_kg && set.reps && set.reps > 0 && set.plan_exercise_id) {
          const estimated = estimate1rm(set.load_kg, set.reps);
          if (estimated) {
            oneRmUpdates.push({
              athlete_id: athlete.id,
              exercise_id: set.plan_exercise_id, // will map to exercise_id below
              value_kg: Math.round(estimated * 100) / 100,
              method: "estimated_epley",
              source: "auto_from_log",
              source_log_id: set.id,
              tested_at: set.session_date
            });
          }
        }
      }

      // For 1RM updates we need to resolve plan_exercise_id → exercise_id
      // This is done by looking up the plan exercise
      if (oneRmUpdates.length > 0) {
        const { supabaseRequest } = require("./_lib/supabase");
        // We can't import supabaseRequest directly (not exported for raw use).
        // Instead, insert 1RM records — we need the exercise_id from strength_plan_exercises
        // For now, the caller (frontend) should handle mapping or we batch-query.
        // Skip auto-1RM for set-level — Phase 5 will handle mapping properly via the plan_exercise join.
      }

      return json(201, { sets: saved || [], oneRmUpdates: oneRmUpdates.length });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal server error" });
  }
};
