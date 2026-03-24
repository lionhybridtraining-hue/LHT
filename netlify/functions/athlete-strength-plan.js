const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");
const {
  getAthleteByIdentity,
  upsertAthleteByIdentity,
  getActiveInstanceForAthlete,
  getStrengthPlanFull,
  getAthlete1rmLatest,
  getStrengthLogs
} = require("./_lib/supabase");
const { resolveLoad } = require("./_lib/strength");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const config = getConfig();

  try {
    const user = await getAuthenticatedUser(event, config);
    if (!user || !user.sub) {
      return json(401, { error: "Authentication required" });
    }

    // Auto-register: create athlete if not exists
    let athlete = await getAthleteByIdentity(config, user.sub);
    if (!athlete) {
      athlete = await upsertAthleteByIdentity(config, {
        identityId: user.sub,
        email: user.email,
        name: user.user_metadata?.full_name || user.email
      });
      if (!athlete) {
        return json(500, { error: "Failed to create athlete record" });
      }
      // Newly created — no plan yet
      return json(200, {
        status: "pending",
        message: "Bem-vindo! O teu coach vai ativar a tua conta.",
        athlete: sanitizeAthlete(athlete)
      });
    }

    // Check for active strength plan instance
    const instance = await getActiveInstanceForAthlete(config, athlete.id);
    if (!instance) {
      return json(200, {
        status: "no_plan",
        message: "Sem plano de força atribuído de momento.",
        athlete: sanitizeAthlete(athlete)
      });
    }

    // Load full plan details
    const planData = await getStrengthPlanFull(config, instance.plan_id);
    if (!planData) {
      return json(200, {
        status: "no_plan",
        message: "Plano não encontrado.",
        athlete: sanitizeAthlete(athlete)
      });
    }

    // Load athlete's 1RMs (latest per exercise)
    const oneRms = await getAthlete1rmLatest(config, athlete.id);
    const oneRmMap = {};
    for (const rm of (oneRms || [])) {
      oneRmMap[rm.exercise_id] = rm.value_kg;
    }

    // Load round from instance or plan
    const loadRound = instance.load_round || planData.plan.load_round || 2.5;

    // Determine current week based on instance start_date
    const currentWeek = calculateCurrentWeek(instance.start_date, planData.plan.total_weeks);

    // Resolve exercises with alternatives based on athlete strength_level
    const resolvedExercises = resolveExerciseAlternatives(
      planData.exercises,
      athlete.strength_level
    );

    // Resolve loads for each prescription (athlete never sees %RM)
    const resolvedPrescriptions = planData.prescriptions.map(rx => {
      const planExercise = resolvedExercises.find(e => e.id === rx.plan_exercise_id);
      if (!planExercise) return { ...rx, loadKg: null };

      const exerciseId = planExercise.resolved_exercise_id || planExercise.exercise_id;
      const oneRm = oneRmMap[exerciseId] || null;

      const { rmPercent, loadKg } = resolveLoad(rx, planExercise, oneRm, loadRound, rx.week_number);

      // Athlete sees loadKg. Only show %RM as fallback when override exists but no 1RM
      const showRmPercent = (rx.rm_percent_override != null && !oneRm) ? rmPercent : null;

      return {
        id: rx.id,
        plan_exercise_id: rx.plan_exercise_id,
        week_number: rx.week_number,
        prescription_type: rx.prescription_type,
        sets: rx.sets,
        reps: rx.reps,
        reps_min: rx.reps_min || null,
        reps_max: rx.reps_max || null,
        duration_seconds: rx.duration_seconds,
        rest_seconds: rx.rest_seconds,
        rir: rx.rir != null ? rx.rir : null,
        tempo: rx.tempo,
        gct: rx.gct,
        method: rx.method,
        coach_notes: rx.coach_notes,
        loadKg: loadKg,
        rmPercent: showRmPercent
      };
    });

    // Load existing logs for the plan
    const qs = event.queryStringParameters || {};
    const weekFilter = qs.weekNumber ? parseInt(qs.weekNumber, 10) : null;
    const logs = await getStrengthLogs(config, athlete.id, instance.plan_id, weekFilter);

    // Determine quick mode from program if linked
    let quickMode = false;
    if (planData.plan.training_program_id) {
      // training_programs.quick_mode is loaded via instance.plan reference
      quickMode = instance.plan?.quick_mode || false;
    }

    return json(200, {
      status: "active",
      athlete: sanitizeAthlete(athlete),
      instance: {
        id: instance.id,
        plan_id: instance.plan_id,
        start_date: instance.start_date,
        load_round: loadRound,
        status: instance.status
      },
      plan: {
        id: planData.plan.id,
        name: planData.plan.name,
        description: planData.plan.description,
        total_weeks: planData.plan.total_weeks,
        current_week: currentWeek,
        quick_mode: quickMode
      },
      exercises: resolvedExercises.map(e => ({
        id: e.id,
        exercise_id: e.resolved_exercise_id || e.exercise_id,
        original_exercise_id: e.exercise_id,
        day_number: e.day_number,
        section: e.section,
        exercise_order: e.exercise_order,
        superset_group: e.superset_group,
        each_side: e.each_side,
        weight_per_side: e.weight_per_side,
        plyo_mechanical_load: e.plyo_mechanical_load,
        exercise: e.resolved_exercise || e.exercise
      })),
      prescriptions: resolvedPrescriptions,
      phaseNotes: planData.phaseNotes || [],
      logs: logs || []
    });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal server error" });
  }
};

function sanitizeAthlete(athlete) {
  return {
    id: athlete.id,
    name: athlete.name || null,
    email: athlete.email || null,
    strength_level: athlete.strength_level || null,
    strength_log_detail: athlete.strength_log_detail || "exercise"
  };
}

function calculateCurrentWeek(startDate, totalWeeks) {
  if (!startDate) return 1;
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now - start;
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, Math.min(diffWeeks, totalWeeks || 52));
}

function resolveExerciseAlternatives(exercises, strengthLevel) {
  return exercises.map(pe => {
    // Default: use the assigned exercise
    let resolvedExerciseId = pe.exercise_id;
    let resolvedExercise = pe.exercise;

    if (strengthLevel === "beginner") {
      // Plan-level override first, then catalog default
      if (pe.alt_regression_exercise_id) {
        resolvedExerciseId = pe.alt_regression_exercise_id;
        resolvedExercise = pe.alt_regression_exercise || pe.exercise;
      } else if (pe.exercise?.regression_of) {
        // Catalog: this exercise IS a progression of something — look for regression
        // (regression_of means "this is a regression of X", so we'd want the exercise itself as regression)
        // Actually: progression_of = "this is harder than X", regression_of = "this is easier than X"
        // For a beginner, we want the regression version
        // Since exercises table stores regression_of as self-FK pointing to the standard exercise,
        // we can't easily reverse-lookup. Plan-level override is the reliable path.
      }
    } else if (strengthLevel === "advanced") {
      if (pe.alt_progression_exercise_id) {
        resolvedExerciseId = pe.alt_progression_exercise_id;
        resolvedExercise = pe.alt_progression_exercise || pe.exercise;
      }
    }
    // intermediate or null → use standard exercise (no change)

    return {
      ...pe,
      resolved_exercise_id: resolvedExerciseId,
      resolved_exercise: resolvedExercise
    };
  });
}
