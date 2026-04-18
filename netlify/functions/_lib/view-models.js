/**
 * view-models.js
 * Aggregation layer that composes internal tables into simplified UI payloads.
 *
 * Three canonical shapes:
 *   1. ProgramBlueprint  — product + variant + preset + session structure
 *   2. AthleteProfile     — identity + VDOT + zones + 1RM + strength overrides
 *   3. CalendarWeek       — materialized weekly plan rows with context
 *
 * These are READ-ONLY composers. Writes go through the existing endpoints.
 */

const {
  getTrainingProgramById,
  getVariantsForProgram,
  listVariantPresetLinks,
  listProgramSchedulePresets,
  listProgramWeeklySessions,
  listProgramScheduleSlots,
  getAthleteById,
  getCurrentRunningVdot,
  listRunningVdotHistory,
  listAthleteTrainingZoneProfiles,
  getAthlete1rmLatest,
  getExercisesByIds,
  getActiveAssignmentsForAthlete,
  listAthleteWeeklyPlan,
  getProgramAssignmentById,
  getActiveRunningPlanInstance,
  getActiveInstanceForAthlete,
} = require("./supabase");

// Helper: fetch assignment + resolve program name
async function getAssignmentWithProgram(config, assignmentId) {
  const assignment = await getProgramAssignmentById(config, assignmentId);
  if (!assignment) return null;
  if (assignment.training_program_id) {
    const program = await getTrainingProgramById(config, assignment.training_program_id);
    if (program) {
      assignment.training_program = { id: program.id, name: program.name };
    }
  }
  return assignment;
}

// ═══════════════════════════════════════════════════════════
// 1. ProgramBlueprint
// ═══════════════════════════════════════════════════════════

/**
 * Compose a full ProgramBlueprint for a training_program.
 * Aggregates: training_programs, program_variants, variant_preset_links,
 * program_schedule_presets, program_schedule_slots, program_weekly_sessions.
 *
 * @param {Object} config
 * @param {string} trainingProgramId
 * @returns {Object|null} ProgramBlueprint view-model
 */
async function composeProgramBlueprint(config, trainingProgramId) {
  const program = await getTrainingProgramById(config, trainingProgramId);
  if (!program) return null;

  const [variants, presets, weeklySessions] = await Promise.all([
    getVariantsForProgram(config, trainingProgramId),
    listProgramSchedulePresets(config, trainingProgramId),
    listProgramWeeklySessions(config, trainingProgramId),
  ]);

  // Fetch variant→preset links for all variants
  const variantIds = (variants || []).map((v) => v.id).filter(Boolean);
  const allLinks = variantIds.length
    ? await listVariantPresetLinks(config, variantIds)
    : [];

  // Fetch slots for each preset
  const presetSlots = new Map();
  for (const preset of (presets || [])) {
    const slots = await listProgramScheduleSlots(config, preset.id);
    presetSlots.set(preset.id, slots || []);
  }

  // Build variant summaries
  const variantSummaries = (variants || []).map((v) => {
    const links = (allLinks || []).filter((l) => l.variant_id === v.id);
    return {
      id: v.id,
      duration_weeks: v.duration_weeks,
      experience_level: v.experience_level,
      weekly_frequency: v.weekly_frequency,
      strength_plan_id: v.strength_plan_id || null,
      running_plan_template_id: v.running_plan_template_id || null,
      running_config_preset: v.running_config_preset || null,
      compatible_presets: links.map((l) => ({
        preset_id: l.preset_id,
        is_default: l.is_default || false,
        preset_name: l.preset && l.preset.preset_name ? l.preset.preset_name : null,
      })),
    };
  });

  // Build preset summaries
  const presetSummaries = (presets || []).map((p) => {
    const slots = presetSlots.get(p.id) || [];
    // Group slots by week_number
    const weekMap = new Map();
    for (const slot of slots) {
      const wk = slot.week_number || 1;
      if (!weekMap.has(wk)) weekMap.set(wk, []);
      weekMap.get(wk).push({
        day_of_week: slot.day_of_week,
        time_slot: slot.time_slot,
        session_key: slot.session_key || null,
        session_label: slot.session_label || null,
      });
    }

    return {
      id: p.id,
      preset_name: p.preset_name,
      description: p.description || null,
      total_training_days: p.total_training_days || null,
      is_default: p.is_default || false,
      weeks: Object.fromEntries(
        [...weekMap.entries()].sort(([a], [b]) => a - b)
      ),
    };
  });

  // Build session summaries
  const sessionSummaries = (weeklySessions || []).map((s) => ({
    id: s.id,
    session_key: s.session_key,
    label: s.label || s.session_key,
    discipline: s.discipline || null,
    session_type: s.session_type || null,
    sort_priority: s.sort_priority || 0,
    strength_plan_id: s.strength_plan_id || null,
    running_plan_template_id: s.running_plan_template_id || null,
    running_workout_template_id: s.running_workout_template_id || null,
  }));

  return {
    id: program.id,
    name: program.name,
    commercial_description: program.commercial_description || program.description || null,
    classification: program.classification || null,
    duration_weeks: program.duration_weeks,
    price_cents: program.price_cents || 0,
    billing_type: program.billing_type,
    status: program.status,
    event_id: program.event_id || null,
    default_variant_id: program.default_variant_id || null,
    preset_selection: program.preset_selection || null,
    variants: variantSummaries,
    presets: presetSummaries,
    sessions: sessionSummaries,
  };
}

// ═══════════════════════════════════════════════════════════
// 2. AthleteProfile
// ═══════════════════════════════════════════════════════════

/**
 * Compose a unified AthleteProfile for the UI.
 * Aggregates: athletes, athlete_running_vdot_history, athlete_training_zone_profiles,
 * athlete_training_zones, athlete_exercise_1rm.
 *
 * @param {Object} config
 * @param {string} athleteId
 * @returns {Object|null} AthleteProfile view-model
 */
async function composeAthleteProfile(config, athleteId) {
  const athlete = await getAthleteById(config, athleteId);
  if (!athlete) return null;

  const [
    currentVdot,
    vdotHistory,
    zoneProfiles,
    oneRmRecords,
    activeAssignments,
    activeStrengthInstance,
    activeRunningInstance,
  ] = await Promise.all([
    getCurrentRunningVdot(config, athleteId),
    listRunningVdotHistory(config, athleteId, 5),
    listAthleteTrainingZoneProfiles(config, athleteId),
    getAthlete1rmLatest(config, athleteId),
    getActiveAssignmentsForAthlete(config, athleteId),
    getActiveInstanceForAthlete(config, athleteId),
    getActiveRunningPlanInstance(config, athleteId),
  ]);

  // Build zone summaries (listAthleteTrainingZoneProfiles returns zones inline)
  const zoneSummaries = (zoneProfiles || []).map((profile) => ({
    modality: profile.modality,
    metric_type: profile.metric_type,
    model: profile.model,
    family: profile.family || null,
    method: profile.method || null,
    thresholds: {
      lthr_bpm: profile.lthr_bpm || null,
      hr_max_bpm: profile.hr_max_bpm || null,
      hr_rest_bpm: profile.hr_rest_bpm || null,
      threshold_pace_sec_per_km: profile.threshold_pace_sec_per_km || null,
      vdot: profile.vdot || null,
    },
    zones: (profile.zones || []).map((z) => ({
      zone_number: z.zone_number,
      min_value: z.min_value,
      max_value: z.max_value,
      label: z.label || null,
    })),
  }));

  // Build 1RM summary — resolve exercise names via batch lookup
  const exerciseIds = (oneRmRecords || [])
    .map((r) => r.exercise_id)
    .filter(Boolean);
  const exerciseMap = new Map();
  if (exerciseIds.length) {
    const exercises = await getExercisesByIds(config, exerciseIds);
    for (const ex of (exercises || [])) {
      exerciseMap.set(ex.id, ex.name);
    }
  }
  const strengthProfile = (oneRmRecords || []).map((r) => ({
    exercise_id: r.exercise_id,
    exercise_name: exerciseMap.get(r.exercise_id) || null,
    current_1rm_kg: r.value_kg,
    method: r.method,
    tested_at: r.tested_at,
  }));

  return {
    id: athlete.id,
    name: athlete.name,
    email: athlete.email,
    phone: athlete.phone || null,
    goal_distance: athlete.goal_distance || null,
    weekly_frequency: athlete.weekly_frequency || null,
    experience_level: athlete.experience_level || null,
    consistency_level: athlete.consistency_level || null,
    coach_strength_level_override: athlete.coach_strength_level_override || null,
    coach_gym_access_override: athlete.coach_gym_access_override || null,

    // Running performance
    performance: {
      current_vdot: currentVdot ? currentVdot.vdot : null,
      vdot_source: currentVdot ? currentVdot.source_type : null,
      vdot_measured_at: currentVdot ? currentVdot.measured_at : null,
      threshold_pace_sec_per_km: currentVdot ? currentVdot.threshold_pace_sec_per_km : null,
      vdot_history: (vdotHistory || []).map((h) => ({
        vdot: h.vdot,
        source_type: h.source_type,
        measured_at: h.measured_at,
        race_distance_km: h.race_distance_km || null,
      })),
    },

    // Training zones
    zones: zoneSummaries,

    // Strength profile
    strength: strengthProfile,

    // Active program assignments (summary only)
    active_assignments: (activeAssignments || []).map((a) => ({
      id: a.id,
      training_program_id: a.training_program_id,
      program_name: a.training_program ? a.training_program.name : null,
      start_date: a.start_date,
      duration_weeks: a.duration_weeks,
      status: a.status,
    })),

    // Active plan instances (summary)
    active_strength_instance: activeStrengthInstance
      ? {
          id: activeStrengthInstance.id,
          plan_id: activeStrengthInstance.plan_id,
          plan_name: activeStrengthInstance.plan ? activeStrengthInstance.plan.name : null,
          status: activeStrengthInstance.status,
        }
      : null,

    active_running_instance: activeRunningInstance
      ? {
          id: activeRunningInstance.id,
          plan_template_id: activeRunningInstance.plan_template_id,
          status: activeRunningInstance.status,
          current_vdot: activeRunningInstance.current_vdot,
        }
      : null,
  };
}

// ═══════════════════════════════════════════════════════════
// 3. CalendarWeek
// ═══════════════════════════════════════════════════════════

const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/**
 * Compose a clean CalendarWeek for an athlete.
 *
 * @param {Object} config
 * @param {string} athleteId
 * @param {Object} opts
 * @param {string|null} opts.programAssignmentId - optional filter
 * @param {number|null} opts.weekNumber - optional filter
 * @param {string|null} opts.weekStartDate - optional ISO date filter (overrides weekNumber)
 * @returns {Object} CalendarWeek view-model
 */
async function composeCalendarWeek(config, athleteId, opts) {
  const { programAssignmentId, weekNumber, weekStartDate } = opts || {};

  const allRows = await listAthleteWeeklyPlan(config, {
    athleteId,
    programAssignmentId: programAssignmentId || undefined,
    weekNumber: undefined, // always fetch all, filter client-side for week_start_date support
  });

  const rows = Array.isArray(allRows) ? allRows : [];

  // Discover available weeks (by week_start_date for calendar, by week_number for reference)
  const weekDateOptions = [...new Set(rows.map((r) => r.week_start_date).filter(Boolean))].sort();
  const weekNumberOptions = [...new Set(rows.map((r) => r.week_number).filter((n) => n != null))].sort((a, b) => a - b);

  // Determine which rows to show
  let weekRows;
  let resolvedWeekStart = null;
  let resolvedWeekNumber = null;

  if (weekStartDate && weekDateOptions.includes(weekStartDate)) {
    // Filter by week_start_date (preferred — calendar-centric)
    weekRows = rows.filter((r) => r.week_start_date === weekStartDate);
    resolvedWeekStart = weekStartDate;
    resolvedWeekNumber = weekRows.length ? weekRows[0].week_number : null;
  } else if (weekNumber != null) {
    weekRows = rows.filter((r) => r.week_number === weekNumber);
    resolvedWeekNumber = weekNumber;
    resolvedWeekStart = weekRows.length ? weekRows[0].week_start_date : null;
  } else {
    // Default: pick the current or latest week by date
    const today = new Date().toISOString().slice(0, 10);
    let picked = null;
    for (const w of weekDateOptions) {
      if (w <= today) picked = w;
    }
    picked = picked || (weekDateOptions.length ? weekDateOptions[weekDateOptions.length - 1] : null);
    if (picked) {
      weekRows = rows.filter((r) => r.week_start_date === picked);
      resolvedWeekStart = picked;
      resolvedWeekNumber = weekRows.length ? weekRows[0].week_number : null;
    } else {
      weekRows = [];
    }
  }

  // Collect unique assignment IDs and fetch context
  const assignmentIds = [...new Set(weekRows.map((r) => r.program_assignment_id).filter(Boolean))];
  const assignments = new Map();

  for (const aId of assignmentIds) {
    const assignment = await getAssignmentWithProgram(config, aId);
    if (assignment) assignments.set(aId, assignment);
  }

  // Build entries
  const entries = weekRows.map((r) => {
    const assignment = assignments.get(r.program_assignment_id) || {};
    return {
      id: r.id,
      week_number: r.week_number,
      day_of_week: r.day_of_week,
      day_label: DAY_LABELS[(r.day_of_week || 1) - 1] || null,
      time_slot: r.time_slot || null,
      date: r.week_start_date
        ? addDays(r.week_start_date, (r.day_of_week || 1) - 1)
        : null,
      discipline: r.discipline || null,
      session_type: r.session_type || null,
      session_label: r.session_label || r.session_key || null,
      title: r.title || r.session_label || r.session_key || null,
      status: r.status || "planned",
      program_assignment_id: r.program_assignment_id || null,
      program_name: assignment.training_program
        ? assignment.training_program.name
        : null,
      strength_instance_id: r.strength_instance_id || null,
      strength_week_number: r.strength_week_number || null,
      strength_day_number: r.strength_day_number || null,
      running_plan_instance_id: r.running_plan_instance_id || null,
      running_workout_instance_id: r.running_workout_instance_id || null,
    };
  });

  return {
    athlete_id: athleteId,
    week_number: resolvedWeekNumber,
    week_start_date: resolvedWeekStart,
    available_weeks: weekDateOptions,
    available_week_numbers: weekNumberOptions,
    entries,
  };
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════

module.exports = {
  composeProgramBlueprint,
  composeAthleteProfile,
  composeCalendarWeek,
};
