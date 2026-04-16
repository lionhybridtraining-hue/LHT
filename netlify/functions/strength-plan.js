const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { getProgramAssociationAccess } = require("./_lib/program-access");
const { randomUUID } = require("crypto");
const {
  listStrengthPlans,
  getStrengthPlanFull,
  createStrengthPlan,
  updateStrengthPlan,
  upsertStrengthPlanExercises,
  deleteStrengthPlanExercises,
  upsertStrengthPrescriptions,
  upsertStrengthPlanPhaseNotes,
  listStrengthPlanDayLabels,
  upsertStrengthPlanDayLabels,
  deleteStrengthPlanDayLabelsByDays,
  getStrengthPlanById,
  listStrengthPlanInstances,
  createStrengthPlanInstance,
  updateStrengthPlanInstance,
  getStrengthPlanInstanceById,
  getActiveInstanceForAthlete,
  getExercisesByIds,
  getInProgressStrengthSessionForInstanceOnDate,
  verifyCoachOwnsAthlete,
  getAthleteById
} = require("./_lib/supabase");

const SNAPSHOT_SECTIONS = new Set(["warm_up", "plyos_speed", "main", "conditioning", "observations"]);
const SNAPSHOT_METHODS = new Set(["standard", "amrap", "drop_set", "rest_pause", "cluster", "myo_reps", "isometric"]);
const SNAPSHOT_GCT_VALUES = new Set(["altura", "rápido", "intermédio"]);
const SNAPSHOT_PLYO_LOADS = new Set(["high", "medium", "low"]);

function asTrimmedString(value) {
  if (value == null) return null;
  const trimmed = value.toString().trim();
  return trimmed || null;
}

function asBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function asInteger(value, field, { min = null, max = null, allowNull = false } = {}) {
  if (value == null || value === "") {
    if (allowNull) return null;
    throw Object.assign(new Error(`${field} is required`), { status: 400 });
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw Object.assign(new Error(`${field} must be an integer`), { status: 400 });
  }
  if (min != null && parsed < min) {
    throw Object.assign(new Error(`${field} must be >= ${min}`), { status: 400 });
  }
  if (max != null && parsed > max) {
    throw Object.assign(new Error(`${field} must be <= ${max}`), { status: 400 });
  }
  return parsed;
}

function asNumber(value, field, { allowNull = false } = {}) {
  if (value == null || value === "") {
    if (allowNull) return null;
    throw Object.assign(new Error(`${field} is required`), { status: 400 });
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw Object.assign(new Error(`${field} must be a number`), { status: 400 });
  }
  return parsed;
}

function parseInstanceSnapshot(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
  return raw;
}

async function getInstanceSnapshotBase(config, instance) {
  const parsed = parseInstanceSnapshot(instance.plan_snapshot);
  if (parsed) return parsed;

  const full = await getStrengthPlanFull(config, instance.plan_id);
  if (!full) {
    throw Object.assign(new Error("Plan not found for instance"), { status: 404 });
  }

  return {
    exercises: full.exercises || [],
    prescriptions: full.prescriptions || [],
    phaseNotes: full.phaseNotes || []
  };
}

async function buildSnapshotExerciseCatalog(config, exercises) {
  const exerciseIds = new Set();
  for (const entry of (exercises || [])) {
    if (entry && entry.exercise_id) exerciseIds.add(entry.exercise_id);
    if (entry && entry.alt_progression_exercise_id) exerciseIds.add(entry.alt_progression_exercise_id);
    if (entry && entry.alt_regression_exercise_id) exerciseIds.add(entry.alt_regression_exercise_id);
    if (entry && entry.alt_lateral_exercise_id) exerciseIds.add(entry.alt_lateral_exercise_id);
  }
  const rows = await getExercisesByIds(config, Array.from(exerciseIds));
  return (rows || []).reduce((acc, row) => {
    acc[row.id] = row;
    return acc;
  }, {});
}

function sanitizeSnapshotExercises(exercises, planId, exerciseCatalog) {
  const normalized = (exercises || []).map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw Object.assign(new Error(`exercises[${index}] must be an object`), { status: 400 });
    }

    const exerciseId = asTrimmedString(entry.exercise_id);
    if (!exerciseId || !exerciseCatalog[exerciseId]) {
      throw Object.assign(new Error(`exercises[${index}].exercise_id is invalid`), { status: 400 });
    }

    const altProgressionId = asTrimmedString(entry.alt_progression_exercise_id);
    if (altProgressionId && !exerciseCatalog[altProgressionId]) {
      throw Object.assign(new Error(`exercises[${index}].alt_progression_exercise_id is invalid`), { status: 400 });
    }

    const altRegressionId = asTrimmedString(entry.alt_regression_exercise_id);
    if (altRegressionId && !exerciseCatalog[altRegressionId]) {
      throw Object.assign(new Error(`exercises[${index}].alt_regression_exercise_id is invalid`), { status: 400 });
    }

    const altLateralId = asTrimmedString(entry.alt_lateral_exercise_id);
    if (altLateralId && !exerciseCatalog[altLateralId]) {
      throw Object.assign(new Error(`exercises[${index}].alt_lateral_exercise_id is invalid`), { status: 400 });
    }

    const section = asTrimmedString(entry.section);
    if (!section || !SNAPSHOT_SECTIONS.has(section)) {
      throw Object.assign(new Error(`exercises[${index}].section is invalid`), { status: 400 });
    }

    const plyoLoad = asTrimmedString(entry.plyo_mechanical_load);
    if (plyoLoad && !SNAPSHOT_PLYO_LOADS.has(plyoLoad)) {
      throw Object.assign(new Error(`exercises[${index}].plyo_mechanical_load is invalid`), { status: 400 });
    }

    return {
      id: asTrimmedString(entry.id) || randomUUID(),
      plan_id: planId,
      day_number: asInteger(entry.day_number, `exercises[${index}].day_number`, { min: 1, max: 7 }),
      section,
      superset_group: asTrimmedString(entry.superset_group),
      exercise_order: asInteger(entry.exercise_order, `exercises[${index}].exercise_order`, { min: 1 }),
      exercise_id: exerciseId,
      each_side: asBoolean(entry.each_side),
      weight_per_side: asBoolean(entry.weight_per_side),
      plyo_mechanical_load: plyoLoad,
      rm_percent_increase_per_week: entry.rm_percent_increase_per_week == null || entry.rm_percent_increase_per_week === ""
        ? null
        : asNumber(entry.rm_percent_increase_per_week, `exercises[${index}].rm_percent_increase_per_week`, { allowNull: true }),
      alt_progression_exercise_id: altProgressionId,
      alt_regression_exercise_id: altRegressionId,
      alt_lateral_exercise_id: altLateralId,
      created_at: asTrimmedString(entry.created_at) || new Date().toISOString(),
      exercise: exerciseCatalog[exerciseId] || null,
      alt_progression_exercise: altProgressionId ? (exerciseCatalog[altProgressionId] || null) : null,
      alt_regression_exercise: altRegressionId ? (exerciseCatalog[altRegressionId] || null) : null,
      alt_lateral_exercise: altLateralId ? (exerciseCatalog[altLateralId] || null) : null
    };
  });

  normalized.sort((left, right) => {
    if (left.day_number !== right.day_number) return left.day_number - right.day_number;
    if (left.section !== right.section) return left.section.localeCompare(right.section);
    return left.exercise_order - right.exercise_order;
  });

  return normalized;
}

function sanitizeSnapshotPrescriptions(prescriptions, exerciseIds) {
  const exerciseIdSet = new Set(exerciseIds);
  const seen = new Set();
  const normalized = (prescriptions || []).map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw Object.assign(new Error(`prescriptions[${index}] must be an object`), { status: 400 });
    }

    const planExerciseId = asTrimmedString(entry.plan_exercise_id);
    if (!planExerciseId || !exerciseIdSet.has(planExerciseId)) {
      throw Object.assign(new Error(`prescriptions[${index}].plan_exercise_id must reference an exercise in the snapshot`), { status: 400 });
    }

    const weekNumber = asInteger(entry.week_number, `prescriptions[${index}].week_number`, { min: 1 });
    const compositeKey = `${planExerciseId}:${weekNumber}`;
    if (seen.has(compositeKey)) {
      throw Object.assign(new Error(`Duplicate prescription for plan_exercise_id ${planExerciseId} week ${weekNumber}`), { status: 400 });
    }
    seen.add(compositeKey);

    const prescriptionType = asTrimmedString(entry.prescription_type) || "reps";
    if (prescriptionType !== "reps" && prescriptionType !== "duration") {
      throw Object.assign(new Error(`prescriptions[${index}].prescription_type is invalid`), { status: 400 });
    }

    const method = asTrimmedString(entry.method) || "standard";
    if (!SNAPSHOT_METHODS.has(method)) {
      throw Object.assign(new Error(`prescriptions[${index}].method is invalid`), { status: 400 });
    }

    const gct = asTrimmedString(entry.gct);
    if (gct && !SNAPSHOT_GCT_VALUES.has(gct)) {
      throw Object.assign(new Error(`prescriptions[${index}].gct is invalid`), { status: 400 });
    }

    return {
      id: asTrimmedString(entry.id) || randomUUID(),
      plan_exercise_id: planExerciseId,
      week_number: weekNumber,
      prescription_type: prescriptionType,
      sets: asInteger(entry.sets == null ? 1 : entry.sets, `prescriptions[${index}].sets`, { min: 1 }),
      reps: asInteger(entry.reps, `prescriptions[${index}].reps`, { min: 0, allowNull: true }),
      reps_min: asInteger(entry.reps_min, `prescriptions[${index}].reps_min`, { min: 0, allowNull: true }),
      reps_max: asInteger(entry.reps_max, `prescriptions[${index}].reps_max`, { min: 0, allowNull: true }),
      duration_seconds: asInteger(entry.duration_seconds, `prescriptions[${index}].duration_seconds`, { min: 0, allowNull: true }),
      rest_seconds: asInteger(entry.rest_seconds, `prescriptions[${index}].rest_seconds`, { min: 0, allowNull: true }),
      rir: asInteger(entry.rir, `prescriptions[${index}].rir`, { min: 0, allowNull: true }),
      tempo: asTrimmedString(entry.tempo),
      gct,
      method,
      rm_percent_override: entry.rm_percent_override == null || entry.rm_percent_override === ""
        ? null
        : asNumber(entry.rm_percent_override, `prescriptions[${index}].rm_percent_override`, { allowNull: true }),
      load_override_kg: entry.load_override_kg == null || entry.load_override_kg === ""
        ? null
        : asNumber(entry.load_override_kg, `prescriptions[${index}].load_override_kg`, { allowNull: true }),
      coach_notes: asTrimmedString(entry.coach_notes),
      created_at: asTrimmedString(entry.created_at) || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  normalized.sort((left, right) => {
    if (left.week_number !== right.week_number) return left.week_number - right.week_number;
    return left.plan_exercise_id.localeCompare(right.plan_exercise_id);
  });

  return normalized;
}

function sanitizeSnapshotPhaseNotes(notes, planId) {
  const seen = new Set();
  const normalized = (notes || []).map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw Object.assign(new Error(`phase_notes[${index}] must be an object`), { status: 400 });
    }

    const section = asTrimmedString(entry.section);
    if (!section || !SNAPSHOT_SECTIONS.has(section)) {
      throw Object.assign(new Error(`phase_notes[${index}].section is invalid`), { status: 400 });
    }

    const dayNumber = asInteger(entry.day_number, `phase_notes[${index}].day_number`, { min: 1, max: 7 });
    const weekNumber = asInteger(entry.week_number, `phase_notes[${index}].week_number`, { min: 1 });
    const compositeKey = `${dayNumber}:${section}:${weekNumber}`;
    if (seen.has(compositeKey)) {
      throw Object.assign(new Error(`Duplicate phase note for day ${dayNumber}, section ${section}, week ${weekNumber}`), { status: 400 });
    }
    seen.add(compositeKey);

    return {
      id: asTrimmedString(entry.id) || randomUUID(),
      plan_id: planId,
      day_number: dayNumber,
      section,
      week_number: weekNumber,
      notes: entry.notes == null ? "" : entry.notes.toString(),
      created_at: asTrimmedString(entry.created_at) || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  normalized.sort((left, right) => {
    if (left.day_number !== right.day_number) return left.day_number - right.day_number;
    if (left.week_number !== right.week_number) return left.week_number - right.week_number;
    return left.section.localeCompare(right.section);
  });

  return normalized;
}

function sanitizePlanPhaseDefinitions(entries, { totalWeeks, planId } = {}) {
  if (entries == null) return [];
  if (!Array.isArray(entries)) {
    throw Object.assign(new Error("phase_definitions must be an array"), { status: 400 });
  }

  const seenWeeks = new Set();
  const normalized = entries.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw Object.assign(new Error(`phase_definitions[${index}] must be an object`), { status: 400 });
    }

    const startWeek = asInteger(
      entry.start_week != null ? entry.start_week : entry.startWeek,
      `phase_definitions[${index}].start_week`,
      { min: 1 }
    );
    const childPlanId = ((entry.plan_id != null ? entry.plan_id : entry.planId) || "").toString().trim();
    if (!childPlanId) {
      throw Object.assign(new Error(`phase_definitions[${index}].plan_id is required`), { status: 400 });
    }
    if (planId && childPlanId === planId) {
      throw Object.assign(new Error(`phase_definitions[${index}].plan_id cannot reference the same plan`), { status: 400 });
    }
    if (seenWeeks.has(startWeek)) {
      throw Object.assign(new Error(`Duplicate phase start_week ${startWeek}`), { status: 400 });
    }
    seenWeeks.add(startWeek);

    return {
      start_week: startWeek,
      plan_id: childPlanId,
      label: asTrimmedString(entry.label || entry.phase_label) || null
    };
  }).sort((left, right) => left.start_week - right.start_week);

  if (normalized.length > 0) {
    if (normalized[0].start_week !== 1) {
      throw Object.assign(new Error("phase_definitions must start at week 1"), { status: 400 });
    }
    if (Number.isInteger(totalWeeks)) {
      const overflow = normalized.find((entry) => entry.start_week > totalWeeks);
      if (overflow) {
        throw Object.assign(new Error(`Phase start_week ${overflow.start_week} exceeds total_weeks ${totalWeeks}`), { status: 400 });
      }
    }
  }

  return normalized;
}

async function validatePlanPhaseDefinitions(config, entries) {
  const uniquePlanIds = [...new Set((entries || []).map((entry) => entry.plan_id).filter(Boolean))];
  for (const linkedPlanId of uniquePlanIds) {
    const linkedPlan = await getStrengthPlanById(config, linkedPlanId);
    if (!linkedPlan) {
      throw Object.assign(new Error(`Linked phase plan not found: ${linkedPlanId}`), { status: 400 });
    }
  }
}

async function buildValidatedInstanceSnapshot(config, instance, body, actorId) {
  const baseSnapshot = await getInstanceSnapshotBase(config, instance);
  const nextExercisesSource = body.exercises !== undefined ? body.exercises : (baseSnapshot.exercises || []);
  const nextPrescriptionsSource = body.prescriptions !== undefined ? body.prescriptions : (baseSnapshot.prescriptions || []);
  const phaseNotesSource = body.phase_notes !== undefined
    ? body.phase_notes
    : (body.phaseNotes !== undefined ? body.phaseNotes : (baseSnapshot.phaseNotes || []));

  const exerciseCatalog = await buildSnapshotExerciseCatalog(config, nextExercisesSource);
  const exercises = sanitizeSnapshotExercises(nextExercisesSource, instance.plan_id, exerciseCatalog);
  const prescriptions = sanitizeSnapshotPrescriptions(nextPrescriptionsSource, exercises.map((entry) => entry.id));
  const phaseNotes = sanitizeSnapshotPhaseNotes(phaseNotesSource, instance.plan_id);

  return {
    exercises,
    prescriptions,
    phaseNotes,
    updated_by: actorId,
    updated_at_snapshot: new Date().toISOString()
  };
}

exports.handler = async (event) => {
  const config = getConfig();
  const auth = await requireAuthenticatedUser(event, config);
  if (auth.error) return auth.error;

  const roles = Array.isArray(auth.roles) ? auth.roles : [];
  const isCoach = roles.includes("coach");
  const isAdmin = roles.includes("admin");
  if (!isCoach && !isAdmin) {
    return json(403, { error: "Forbidden" });
  }

  const coachId = auth.user.sub;

  try {
    const qs = event.queryStringParameters || {};

    // ── GET ──
    if (event.httpMethod === "GET") {
      // ?instances=1&athleteId=X&planId=X → list instances
      if (qs.instances === "1") {
        const filters = {};
        if (qs.athleteId) filters.athleteId = qs.athleteId;
        if (qs.planId) filters.planId = qs.planId;
        if (qs.status) filters.status = qs.status;
        const instances = await listStrengthPlanInstances(config, filters);
        return json(200, { instances: instances || [] });
      }

      // ?activeInstance=1&athleteId=X → get active instance for athlete
      if (qs.activeInstance === "1" && qs.athleteId) {
        const instance = await getActiveInstanceForAthlete(config, qs.athleteId);
        return json(200, { instance });
      }

      // ?planId=X → full plan template detail
      if (qs.planId) {
        const full = await getStrengthPlanFull(config, qs.planId);
        if (!full) return json(404, { error: "Plan not found" });
        return json(200, full);
      }

      // Default: list plan templates
      const filters = {};
      if (qs.status) filters.status = qs.status;
      if (qs.trainingProgramId) filters.trainingProgramId = qs.trainingProgramId;
      const plans = await listStrengthPlans(config, filters);
      return json(200, { plans: plans || [] });
    }

    // ── POST ──
    if (event.httpMethod === "POST") {
      const body = parseJsonBody(event);

      // POST with action=assign → create instance (assign plan to athlete)
      if (body.action === "assign") {
        if (!body.plan_id || !body.athlete_id) {
          return json(400, { error: "plan_id and athlete_id are required" });
        }
        if (!isAdmin) {
          const owns = await verifyCoachOwnsAthlete(config, coachId, body.athlete_id);
          if (!owns) return json(403, { error: "Forbidden" });
        }

        const planTemplate = await getStrengthPlanById(config, body.plan_id);
        if (!planTemplate) {
          return json(404, { error: "Plan not found" });
        }

        const athlete = await getAthleteById(config, body.athlete_id);
        if (!athlete) {
          return json(404, { error: "Athlete not found" });
        }

        // Soft access check — link program/purchase IDs when available, allow direct assignment
        let access = { hasAccess: false, program: null, purchase: null, assignment: null };
        if (planTemplate.training_program_id) {
          access = await getProgramAssociationAccess(config, {
            athleteId: athlete.id,
            identityId: athlete.identity_id || null,
            programId: planTemplate.training_program_id
          });
        }

        // Phase 5.1 — Snapshot plan data at assignment time
        let planSnapshot = null;
        try {
          const full = await getStrengthPlanFull(config, body.plan_id);
          if (full) {
            planSnapshot = {
              exercises: full.exercises,
              prescriptions: full.prescriptions,
              phaseNotes: full.phaseNotes || []
            };
          }
        } catch (_) { /* best-effort — fall back to live data */ }

        const instance = await createStrengthPlanInstance(config, {
          plan_id: body.plan_id,
          athlete_id: body.athlete_id,
          start_date: body.start_date || null,
          load_round: body.load_round != null ? body.load_round : 2.5,
          status: "active",
          assigned_by: coachId,
          access_model: access.program?.access_model || planTemplate.access_model || null,
          stripe_purchase_id: access.purchase?.id || null,
          program_assignment_id: access.assignment?.id || null,
          coach_locked_until: access.assignment?.computed_end_date || null,
          plan_snapshot: planSnapshot ? JSON.stringify(planSnapshot) : null
        });
        return json(201, { instance });
      }

      // POST default: create new plan template
      if (!body.name || !body.total_weeks) {
        return json(400, { error: "name and total_weeks are required" });
      }
      const phaseDefinitions = sanitizePlanPhaseDefinitions(body.phase_definitions, {
        totalWeeks: Number(body.total_weeks) || null,
        planId: null
      });
      await validatePlanPhaseDefinitions(config, phaseDefinitions);
      const plan = await createStrengthPlan(config, {
        name: body.name,
        description: body.description || null,
        total_weeks: body.total_weeks,
        start_date: body.start_date || null,
        training_program_id: body.training_program_id || null,
        phase_definitions: phaseDefinitions,
        status: "draft",
        created_by: coachId
      });
      return json(201, { plan });
    }

    // ── PUT — upsert exercises + prescriptions + phase notes ──
    if (event.httpMethod === "PUT") {
      const body = parseJsonBody(event);
      if (!body.plan_id) return json(400, { error: "plan_id is required" });

      const plan = await getStrengthPlanById(config, body.plan_id);
      if (!plan) return json(404, { error: "Plan not found" });

      if (body.delete_exercise_ids && body.delete_exercise_ids.length > 0) {
        await deleteStrengthPlanExercises(config, body.delete_exercise_ids);
      }
      if (body.exercises && body.exercises.length > 0) {
        await upsertStrengthPlanExercises(config, body.exercises);
      }
      if (body.prescriptions && body.prescriptions.length > 0) {
        await upsertStrengthPrescriptions(config, body.prescriptions);
      }
      if (body.phase_notes && body.phase_notes.length > 0) {
        await upsertStrengthPlanPhaseNotes(config, body.phase_notes);
      }

      const full = await getStrengthPlanFull(config, body.plan_id);
      return json(200, full);
    }

    // ── PATCH — update plan template metadata OR instance status ──
    if (event.httpMethod === "PATCH") {
      const body = parseJsonBody(event);

      // Patch instance
      if (body.instance_id) {
        const inst = await getStrengthPlanInstanceById(config, body.instance_id);
        if (!inst) return json(404, { error: "Instance not found" });
        if (!isAdmin) {
          const owns = await verifyCoachOwnsAthlete(config, coachId, inst.athlete_id);
          if (!owns) return json(403, { error: "Forbidden" });
        }

        const requestedStatus = body.status !== undefined
          ? (body.status || "").toString().trim()
          : null;
        const allowAdminOverride = Boolean(body.allow_admin_override);
        if (
          requestedStatus === "active" &&
          inst.access_model === "coached_recurring" &&
          !(isAdmin && allowAdminOverride)
        ) {
          return json(403, {
            error: "Recurring coached instances are resumed automatically by subscription lifecycle"
          });
        }

        const hasStructuralChanges = body.exercises !== undefined
          || body.prescriptions !== undefined
          || body.phase_notes !== undefined
          || body.phaseNotes !== undefined;

        if (hasStructuralChanges) {
          const today = new Date().toISOString().slice(0, 10);
          const activeSession = await getInProgressStrengthSessionForInstanceOnDate(config, inst.id, today);
          if (activeSession) {
            return json(409, {
              error: "Cannot edit instance while athlete has a strength session in progress today",
              code: "instance_session_in_progress"
            });
          }
        }

        const allowedInst = ["status", "start_date", "load_round"];
        const patch = {};
        for (const key of allowedInst) {
          if (body[key] !== undefined) patch[key] = body[key];
        }

        if (hasStructuralChanges) {
          const snapshot = await buildValidatedInstanceSnapshot(config, inst, body, coachId);
          patch.plan_snapshot = JSON.stringify(snapshot);
        }

        if (!Object.keys(patch).length) {
          return json(400, { error: "No valid instance fields to update" });
        }

        const updated = await updateStrengthPlanInstance(config, body.instance_id, patch);
        return json(200, { instance: updated });
      }

      // Patch plan template
      if (!body.plan_id) return json(400, { error: "plan_id or instance_id is required" });
      const plan = await getStrengthPlanById(config, body.plan_id);
      if (!plan) return json(404, { error: "Plan not found" });

      const allowed = ["name", "description", "total_weeks", "start_date", "status", "training_program_id"];
      const patch = {};
      for (const key of allowed) {
        if (body[key] !== undefined) patch[key] = body[key];
      }

      if (body.phase_definitions !== undefined) {
        const nextTotalWeeks = body.total_weeks !== undefined
          ? Number(body.total_weeks)
          : Number(plan.total_weeks);
        const phaseDefinitions = sanitizePlanPhaseDefinitions(body.phase_definitions, {
          totalWeeks: Number.isInteger(nextTotalWeeks) ? nextTotalWeeks : null,
          planId: body.plan_id
        });
        await validatePlanPhaseDefinitions(config, phaseDefinitions);
        patch.phase_definitions = phaseDefinitions;
      }

      let updated = plan;
      if (Object.keys(patch).length > 0) {
        updated = await updateStrengthPlan(config, body.plan_id, patch);
      }

      if (Array.isArray(body.day_labels)) {
        const partialDayLabels = (body.day_labels_action || "").toString().trim() === "partial";
        const existingLabels = partialDayLabels ? [] : await listStrengthPlanDayLabels(config, body.plan_id);
        const normalized = [];
        for (let i = 0; i < body.day_labels.length; i++) {
          const entry = body.day_labels[i];
          if (!entry || typeof entry !== "object") {
            return json(400, { error: `day_labels[${i}] must be an object` });
          }
          const dayNumber = Number(entry.day_number);
          if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) {
            return json(400, { error: `day_labels[${i}].day_number must be 1-7` });
          }
          const label = (entry.day_label || "").toString().trim();
          if (!label) continue;
          normalized.push({
            plan_id: body.plan_id,
            day_number: dayNumber,
            day_label: label
          });
        }

        const incomingDaySet = new Set(normalized.map((d) => d.day_number));
        let toDelete = [];
        if (!partialDayLabels) {
          toDelete = (existingLabels || [])
            .map((d) => Number(d.day_number))
            .filter((day) => Number.isInteger(day) && !incomingDaySet.has(day));
        }

        if (partialDayLabels && Array.isArray(body.day_labels_delete_days)) {
          const explicitDeletes = body.day_labels_delete_days
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
          toDelete = Array.from(new Set(explicitDeletes));
        }

        if (toDelete.length > 0) {
          await deleteStrengthPlanDayLabelsByDays(config, body.plan_id, toDelete);
        }
        if (normalized.length > 0) {
          await upsertStrengthPlanDayLabels(config, normalized);
        }
      }

      const full = await getStrengthPlanFull(config, body.plan_id);
      return json(200, full || { plan: updated });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal server error" });
  }
};
