const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  listStrengthWarmupPresets,
  createStrengthWarmupPreset,
  updateStrengthWarmupPreset,
  deleteStrengthWarmupPreset
} = require("./_lib/supabase");

function isCoachOrAdmin(auth) {
  const roles = Array.isArray(auth.roles) ? auth.roles : [];
  return roles.includes("coach") || roles.includes("admin");
}

function asOptionalString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asOptionalNumber(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asOptionalInteger(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

function normalizeWarmupPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("payload is required");
  }

  const sourceDay = asOptionalInteger(payload.source_day_number);
  if (!sourceDay || sourceDay < 1 || sourceDay > 7) {
    throw new Error("payload.source_day_number must be between 1 and 7");
  }

  const incomingExercises = Array.isArray(payload.exercises) ? payload.exercises : [];
  if (incomingExercises.length === 0) {
    throw new Error("payload.exercises must include at least one exercise");
  }

  const exercises = incomingExercises.map((exercise, idx) => {
    const exerciseId = asOptionalString(exercise && exercise.exercise_id);
    if (!exerciseId) {
      throw new Error(`payload.exercises[${idx}].exercise_id is required`);
    }

    const eachSide = Boolean(exercise && exercise.each_side);
    const weightPerSide = Boolean(exercise && exercise.weight_per_side);
    const supersetGroup = asOptionalString(exercise && exercise.superset_group);
    const plyoLoad = asOptionalString(exercise && exercise.plyo_mechanical_load);
    const rmIncrease = asOptionalNumber(exercise && exercise.rm_percent_increase_per_week);

    return {
      preset_exercise_index: idx + 1,
      exercise_id: exerciseId,
      each_side: eachSide,
      weight_per_side: weightPerSide,
      superset_group: supersetGroup,
      plyo_mechanical_load: plyoLoad,
      rm_percent_increase_per_week: rmIncrease
    };
  });

  const validExerciseIndexes = new Set(exercises.map((exercise) => exercise.preset_exercise_index));
  const incomingPrescriptions = Array.isArray(payload.prescriptions) ? payload.prescriptions : [];
  const prescriptions = incomingPrescriptions
    .map((prescription, idx) => {
      const presetExerciseIndex = asOptionalInteger(prescription && prescription.preset_exercise_index);
      const weekNumber = asOptionalInteger(prescription && prescription.week_number);
      if (!presetExerciseIndex || !validExerciseIndexes.has(presetExerciseIndex)) {
        throw new Error(`payload.prescriptions[${idx}].preset_exercise_index is invalid`);
      }
      if (!weekNumber || weekNumber < 1) {
        throw new Error(`payload.prescriptions[${idx}].week_number must be >= 1`);
      }

      return {
        preset_exercise_index: presetExerciseIndex,
        week_number: weekNumber,
        prescription_type: asOptionalString(prescription && prescription.prescription_type) || "reps",
        sets: asOptionalInteger(prescription && prescription.sets),
        reps: asOptionalInteger(prescription && prescription.reps),
        duration_seconds: asOptionalInteger(prescription && prescription.duration_seconds),
        rest_seconds: asOptionalInteger(prescription && prescription.rest_seconds),
        rir: asOptionalInteger(prescription && prescription.rir),
        tempo: asOptionalString(prescription && prescription.tempo),
        gct: asOptionalString(prescription && prescription.gct),
        method: asOptionalString(prescription && prescription.method),
        rm_percent_override: asOptionalNumber(prescription && prescription.rm_percent_override),
        load_override_kg: asOptionalNumber(prescription && prescription.load_override_kg),
        coach_notes: asOptionalString(prescription && prescription.coach_notes)
      };
    })
    .sort((a, b) => (a.preset_exercise_index - b.preset_exercise_index) || (a.week_number - b.week_number));

  const incomingPhaseNotes = Array.isArray(payload.phase_notes) ? payload.phase_notes : [];
  const phaseNotes = incomingPhaseNotes
    .map((note, idx) => {
      const weekNumber = asOptionalInteger(note && note.week_number);
      if (!weekNumber || weekNumber < 1) {
        throw new Error(`payload.phase_notes[${idx}].week_number must be >= 1`);
      }
      return {
        week_number: weekNumber,
        notes: asOptionalString(note && note.notes) || ""
      };
    })
    .sort((a, b) => a.week_number - b.week_number);

  return {
    version: 1,
    section: "warm_up",
    source_day_number: sourceDay,
    source_plan_id: asOptionalString(payload.source_plan_id),
    source_plan_name: asOptionalString(payload.source_plan_name),
    source_total_weeks: asOptionalInteger(payload.source_total_weeks),
    exercises,
    prescriptions,
    phase_notes: phaseNotes
  };
}

exports.handler = async (event) => {
  const config = getConfig();
  const auth = await requireAuthenticatedUser(event, config);
  if (auth.error) return auth.error;
  if (!isCoachOrAdmin(auth)) return json(403, { error: "Forbidden" });

  try {
    if (event.httpMethod === "GET") {
      const presets = await listStrengthWarmupPresets(config);
      return json(200, { presets: presets || [] });
    }

    if (event.httpMethod === "POST") {
      const body = parseJsonBody(event);
      const name = asOptionalString(body.name);
      if (!name) return json(400, { error: "name is required" });

      const payload = normalizeWarmupPayload(body.payload);
      const preset = await createStrengthWarmupPreset(config, {
        name,
        description: asOptionalString(body.description),
        payload,
        created_by: auth.user.sub
      });
      return json(201, { preset });
    }

    if (event.httpMethod === "PATCH") {
      const body = parseJsonBody(event);
      const presetId = asOptionalString(body.id);
      if (!presetId) return json(400, { error: "id is required" });

      const patch = {};
      if (body.name !== undefined) {
        const name = asOptionalString(body.name);
        if (!name) return json(400, { error: "name cannot be empty" });
        patch.name = name;
      }
      if (body.description !== undefined) {
        patch.description = asOptionalString(body.description);
      }
      if (body.payload !== undefined) {
        patch.payload = normalizeWarmupPayload(body.payload);
      }

      if (Object.keys(patch).length === 0) {
        return json(400, { error: "No fields to update" });
      }

      const preset = await updateStrengthWarmupPreset(config, presetId, patch);
      return json(200, { preset });
    }

    if (event.httpMethod === "DELETE") {
      const qs = event.queryStringParameters || {};
      const body = event.body ? parseJsonBody(event) : {};
      const presetId = asOptionalString(qs.id || body.id);
      if (!presetId) return json(400, { error: "id is required" });

      await deleteStrengthWarmupPreset(config, presetId);
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    return json(err.status || 500, { error: err.message || "Internal server error" });
  }
};
