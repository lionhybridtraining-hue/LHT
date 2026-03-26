const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  getAthleteByIdentity,
  insertStrengthLogSets,
  getStrengthLogs,
  insertAthlete1rm,
  getAthlete1rmLatest,
  getActiveInstanceForAthlete,
  getStrengthPlanExercisesByIds,
  createStrengthLogSession,
  updateStrengthLogSession,
  getStrengthLogSession,
  findActiveStrengthSession,
  cancelOrphanedSessions,
  getStrengthSessionHistory,
  getStrengthLogSetsForSessions
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

      // Session history mode
      if (qs.action === "sessions") {
        const sessions = await getStrengthSessionHistory(
          config, athlete.id, qs.planId || null, parseInt(qs.limit, 10) || 20
        );
        if (!sessions || sessions.length === 0) {
          return json(200, { sessions: [] });
        }
        const sessionIds = sessions.map(s => s.id);
        const sets = await getStrengthLogSetsForSessions(config, sessionIds);
        // Group sets by session
        const setsBySession = {};
        for (const set of (sets || [])) {
          if (!setsBySession[set.session_id]) setsBySession[set.session_id] = [];
          setsBySession[set.session_id].push(set);
        }
        const enriched = sessions.map(s => ({
          ...s,
          sets: setsBySession[s.id] || [],
          totalSets: (setsBySession[s.id] || []).length,
          totalVolume: (setsBySession[s.id] || []).reduce(
            (acc, set) => acc + (set.load_kg || 0) * (set.reps || 0), 0
          ),
          totalDuration: (setsBySession[s.id] || []).reduce(
            (acc, set) => acc + (set.duration_seconds || 0), 0
          ),
          uniqueExercises: new Set((setsBySession[s.id] || []).map(set => set.plan_exercise_id)).size
        }));
        return json(200, { sessions: enriched });
      }

      if (!qs.planId) return json(400, { error: "planId is required" });

      const logs = await getStrengthLogs(
        config,
        athlete.id,
        qs.planId,
        qs.weekNumber ? parseInt(qs.weekNumber, 10) : null
      );
      return json(200, { logs: logs || [] });
    }

    // POST — submit log sets or manage sessions
    if (event.httpMethod === "POST") {
      const body = parseJsonBody(event);

      const athlete = await getAthleteByIdentity(config, identityId);
      if (!athlete) return json(404, { error: "Athlete not found" });

      // ── Session management actions ──
      if (body.action === "start_session") {
        if (!body.plan_id || !body.week_number || !body.day_number) {
          return json(400, { error: "plan_id, week_number, and day_number are required" });
        }

        // Phase 1.3 — Cancel orphaned sessions older than 4 hours
        await cancelOrphanedSessions(config, athlete.id, 4);

        // Phase 1.2 — Return existing in-progress session instead of creating duplicate
        const existingSession = await findActiveStrengthSession(
          config, athlete.id, body.plan_id, body.week_number, body.day_number
        );
        if (existingSession) {
          // Return existing sets so frontend can restore state
          const existingSets = await getStrengthLogSetsForSessions(config, [existingSession.id]);
          return json(200, { session: existingSession, resumed: true, sets: existingSets || [] });
        }

        const activeInstance = await getActiveInstanceForAthlete(config, athlete.id);
        const session = await createStrengthLogSession(config, {
          athlete_id: athlete.id,
          instance_id: (activeInstance && activeInstance.plan_id === body.plan_id) ? activeInstance.id : null,
          plan_id: body.plan_id,
          week_number: body.week_number,
          day_number: body.day_number,
          session_date: body.session_date || new Date().toISOString().slice(0, 10),
          status: "in_progress"
        });
        return json(201, { session });
      }

      if (body.action === "finish_session") {
        if (!body.session_id) return json(400, { error: "session_id is required" });
        const existing = await getStrengthLogSession(config, body.session_id);
        if (!existing || existing.athlete_id !== athlete.id) return json(404, { error: "Session not found" });
        // Phase 1.4 — Only in-progress sessions can be finished
        if (existing.status !== "in_progress") {
          return json(409, { error: `Session already ${existing.status}` });
        }
        const session = await updateStrengthLogSession(config, body.session_id, {
          finished_at: new Date().toISOString(),
          status: "completed"
        });
        return json(200, { session });
      }

      if (body.action === "cancel_session") {
        if (!body.session_id) return json(400, { error: "session_id is required" });
        const existing = await getStrengthLogSession(config, body.session_id);
        if (!existing || existing.athlete_id !== athlete.id) return json(404, { error: "Session not found" });
        // Phase 1.4 — Only in-progress sessions can be cancelled
        if (existing.status !== "in_progress") {
          return json(409, { error: `Session already ${existing.status}` });
        }
        const session = await updateStrengthLogSession(config, body.session_id, {
          cancelled_at: new Date().toISOString(),
          status: "cancelled"
        });
        return json(200, { session });
      }

      // ── Log sets ──
      if (!body.plan_id || !body.sets || !body.sets.length) {
        return json(400, { error: "plan_id and sets[] are required" });
      }

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
        session_id: body.session_id || null,
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
      // Fetch current best 1RM per exercise to avoid inserting lower estimates
      let currentBest = {};
      const exerciseIds = [...new Set(Object.values(peToExercise))];
      if (exerciseIds.length > 0) {
        try {
          const latest = await getAthlete1rmLatest(config, athlete.id);
          for (const r of (latest || [])) {
            currentBest[r.exercise_id] = r.value_kg;
          }
        } catch (_) { /* best-effort */ }
      }

      for (const set of (saved || [])) {
        if (set.load_kg && set.reps && set.reps > 0 && set.plan_exercise_id) {
          const exerciseId = peToExercise[set.plan_exercise_id];
          if (!exerciseId) continue;
          const estimated = estimate1rm(set.load_kg, set.reps);
          if (!estimated) continue;
          const rounded = Math.round(estimated * 100) / 100;
          // Only insert if new estimate beats current best (or no existing record)
          const existing = currentBest[exerciseId] || 0;
          if (rounded <= existing) continue;
          try {
            const rm = await insertAthlete1rm(config, {
              athlete_id: athlete.id,
              exercise_id: exerciseId,
              value_kg: rounded,
              method: "estimated_epley",
              source: "auto_from_log",
              source_log_id: set.id,
              tested_at: set.session_date
            });
            if (rm) {
              oneRmInserted.push(rm);
              currentBest[exerciseId] = rounded; // update in-memory best
            }
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
