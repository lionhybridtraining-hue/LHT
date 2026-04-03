const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  getStrengthPlanFull,
  getStrengthLogs,
  getAthlete1rmLatest,
  getActiveInstanceForAthlete,
  verifyCoachOwnsAthlete
} = require("./_lib/supabase");
const { resolveLoad, resolveReps, calculateStimulatingReps, calculateTUT, calculatePlyoLoad } = require("./_lib/strength");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const config = getConfig();
  const auth = await requireAuthenticatedUser(event, config);
  if (auth.error) return auth.error;

  const roles = Array.isArray(auth.roles) ? auth.roles : [];
  const isCoach = roles.includes("coach");
  const isAdmin = roles.includes("admin");
  if (!isCoach && !isAdmin) {
    return json(403, { error: "Forbidden" });
  }

  const qs = event.queryStringParameters || {};
  if (!qs.athleteId || !qs.planId) {
    return json(400, { error: "athleteId and planId are required" });
  }

  try {
    if (!isAdmin) {
      const owns = await verifyCoachOwnsAthlete(config, auth.user.sub, qs.athleteId);
      if (!owns) return json(403, { error: "Forbidden" });
    }

    const full = await getStrengthPlanFull(config, qs.planId);
    if (!full) {
      return json(404, { error: "Plan not found" });
    }

    const oneRms = await getAthlete1rmLatest(config, qs.athleteId);
    const oneRmMap = {};
    for (const r of oneRms) {
      oneRmMap[r.exercise_id] = r.value_kg;
    }

    const activeInstance = await getActiveInstanceForAthlete(config, qs.athleteId);
    const loadRound = activeInstance && activeInstance.plan_id === qs.planId
      ? (activeInstance.load_round || 2.5)
      : 2.5;

    // Build prescription map: plan_exercise_id → { week_number → prescription }
    const rxMap = {};
    for (const rx of full.prescriptions) {
      if (!rxMap[rx.plan_exercise_id]) rxMap[rx.plan_exercise_id] = {};
      rxMap[rx.plan_exercise_id][rx.week_number] = rx;
    }

    // Build planned volume per week
    const weeklyPlanned = {};
    for (let w = 1; w <= full.plan.total_weeks; w++) {
      let totalReps = 0, stimReps = 0, totalRepsTimesRm = 0, totalKg = 0, totalTUT = 0, plyoLoad = 0;

      for (const pe of full.exercises) {
        const rx = (rxMap[pe.id] || {})[w];
        if (!rx) continue;

        const section = pe.section;
        const sets = rx.sets || 1;
        const reps = resolveReps(rx, section, pe);
        const sides = pe.each_side ? 2 : 1;
        const exerciseId = pe.exercise_id || (pe.exercise && pe.exercise.id);
        const oneRm = exerciseId ? oneRmMap[exerciseId] : null;

        if (section === "plyos_speed") {
          plyoLoad += calculatePlyoLoad(sets, reps, pe.each_side, pe.plyo_mechanical_load);
        } else {
          const setReps = reps * sides;
          totalReps += sets * setReps;
          stimReps += sets * calculateStimulatingReps(reps, rx.rir) * sides;

          const { rmPercent, loadKg } = resolveLoad(rx, pe, oneRm, loadRound, w);
          if (rmPercent != null) totalRepsTimesRm += sets * setReps * rmPercent;
          if (loadKg != null) totalKg += sets * setReps * loadKg;
          totalTUT += sets * calculateTUT(reps, rx.tempo) * sides;
        }
      }

      weeklyPlanned[w] = { totalReps, stimReps, totalRepsTimesRm, totalKg, totalTUT, plyoLoad };
    }

    // Get actual logs
    // Build per-exercise per-week planned breakdown
    const byExercise = {};
    for (const pe of full.exercises) {
      byExercise[pe.id] = {
        id: pe.id,
        name: (pe.exercise && pe.exercise.name) || pe.exercise_id || pe.id,
        section: pe.section,
        dayNumber: pe.day_number,
        weeks: {}
      };
    }
    for (let w = 1; w <= full.plan.total_weeks; w++) {
      for (const pe of full.exercises) {
        const rx = (rxMap[pe.id] || {})[w];
        if (!rx) continue;
        const sets = rx.sets || 1;
        const reps = resolveReps(rx, pe.section, pe);
        const sides = pe.each_side ? 2 : 1;
        const exerciseId = pe.exercise_id || (pe.exercise && pe.exercise.id);
        const oneRm = exerciseId ? oneRmMap[exerciseId] : null;
        const { loadKg } = resolveLoad(rx, pe, oneRm, loadRound, w);
        byExercise[pe.id].weeks[w] = {
          plannedSets: sets,
          plannedReps: reps * sides,
          plannedKg: loadKg != null ? sets * reps * sides * loadKg : null,
          actualSets: 0,
          actualReps: 0,
          actualKg: 0
        };
      }
    }

    // Get actual logs
    const logs = await getStrengthLogs(config, qs.athleteId, qs.planId);

    // Aggregate actual volume per week and per exercise
    const weeklyActual = {};
    for (const log of (logs || [])) {
      const w = log.week_number;
      if (!weeklyActual[w]) {
        weeklyActual[w] = { totalReps: 0, totalKg: 0, setCount: 0 };
      }
      const reps = log.reps || 0;
      const load = log.load_kg || 0;
      weeklyActual[w].totalReps += reps;
      weeklyActual[w].totalKg += reps * load;
      weeklyActual[w].setCount += 1;

      const peId = log.plan_exercise_id;
      if (peId && byExercise[peId]) {
        if (!byExercise[peId].weeks[w]) {
          byExercise[peId].weeks[w] = { plannedSets: 0, plannedReps: 0, plannedKg: null, actualSets: 0, actualReps: 0, actualKg: 0 };
        }
        byExercise[peId].weeks[w].actualSets += 1;
        byExercise[peId].weeks[w].actualReps += reps;
        byExercise[peId].weeks[w].actualKg += reps * load;
      }
    }

    return json(200, { plan: full.plan, weeklyPlanned, weeklyActual, byExercise });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal server error" });
  }
};
