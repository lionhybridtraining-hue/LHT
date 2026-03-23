const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  getAthleteByIdentity,
  insertStrengthLogSets,
  getStrengthLogs,
  insertAthlete1rm,
  getActiveInstanceForAthlete,
  getStrengthPlanExercisesByIds
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

      // Resolve the athlete's active instance for this plan (if any)
      const activeInstance = await getActiveInstanceForAthlete(config, athlete.id);
      const instanceId = (activeInstance && activeInstance.plan_id === body.plan_id)
        ? activeInstance.id
        : null;

      const rows = body.sets.map(s => ({
        athlete_id: athlete.id,
        plan_exercise_id: s.plan_exercise_id || null,
        plan_id: body.plan_id,
        instance_id: instanceId,
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
      // Resolve plan_exercise_id → exercise_id for proper 1RM records
      const planExIds = [...new Set(
        (saved || []).filter(s => s.plan_exercise_id && s.load_kg && s.reps > 0)
                     .map(s => s.plan_exercise_id)
      )];

      let peToExercise = {};
      if (planExIds.length > 0) {
        try {
          const planExRows = await getStrengthPlanExercisesByIds(config, planExIds);
          for (const pe of (planExRows || [])) {
            if (pe.exercise_id) peToExercise[pe.id] = pe.exercise_id;
          }
        } catch (_) { /* best-effort */ }
      }

      const oneRmInserted = [];
      for (const set of (saved || [])) {
        if (set.load_kg && set.reps && set.reps > 0 && set.plan_exercise_id) {
          const exerciseId = peToExercise[set.plan_exercise_id];
          if (!exerciseId) continue;
          const estimated = estimate1rm(set.load_kg, set.reps);
          if (!estimated) continue;
          try {
            const rm = await insertAthlete1rm(config, {
              athlete_id: athlete.id,
              exercise_id: exerciseId,
              value_kg: Math.round(estimated * 100) / 100,
              method: "estimated_epley",
              source: "auto_from_log",
              source_log_id: set.id,
              tested_at: set.session_date
            });
            if (rm) oneRmInserted.push(rm);
          } catch (_) { /* best-effort */ }
        }
      }

      return json(201, { sets: saved || [], oneRmUpdates: oneRmInserted.length });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal server error" });
  }
};
