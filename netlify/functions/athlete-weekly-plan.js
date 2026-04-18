const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { getWeekStartIso, getCurrentOrNextWeekStartIso } = require("./_lib/date");
const {
  getProgramSchedulePresetById,
  listVariantPresetLinks,
  listProgramScheduleSlots,
  listProgramWeeklySessions,
  getProgramAssignmentById,
  listStrengthPlanInstances,
  insertAthleteWeeklyPlanRows,
  deleteAthleteWeeklyPlan,
  deleteAthleteWeeklyPlanFromWeek,
  listAthleteWeeklyPlan,
  updateAthleteWeeklyPlanRow,
  getAthleteWeeklyPlanRowById,
  getAthleteByIdentity,
  setAssignmentPreset,
  setAssignmentVariant,
  updateProgramAssignment,
  getVariantById,
  createStrengthPlanInstance,
  getStrengthPlanById,
  getTrainingProgramById,
  createRunningPlanInstance,
  getRunningPlanTemplateById,
  getActiveRunningPlanInstance,
  getCurrentRunningVdot,
  listRunningPlanTemplateSessions,
  listRunningWorkoutTemplateSteps,
  insertRunningWorkoutInstances,
  updateRunningPlanInstance,
} = require("./_lib/supabase");
const {
  ENGINE_VERSION,
  calculatePaces,
  phaseWeeklyDistances,
} = require("./_lib/running-engine");

const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function normalizeStrengthPhaseDefinitions(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      const startWeek = Number(entry && (entry.start_week != null ? entry.start_week : entry.startWeek));
      const planId = ((entry && (entry.plan_id != null ? entry.plan_id : entry.planId)) || "").toString().trim();
      if (!Number.isInteger(startWeek) || startWeek < 1 || !planId) return null;
      return {
        start_week: startWeek,
        plan_id: planId,
        label: (entry.label || entry.phase_label || "").toString().trim() || null
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start_week - right.start_week);
}

async function loadStrengthPlanPhaseTree(config, planIds, cache, depth = 0) {
  if (depth > 8) return;

  for (const planId of (planIds || [])) {
    if (!planId || cache.has(planId)) continue;
    const plan = await getStrengthPlanById(config, planId);
    cache.set(planId, plan || null);
    if (!plan) continue;

    const phaseDefinitions = normalizeStrengthPhaseDefinitions(plan.phase_definitions);
    if (phaseDefinitions.length > 0) {
      await loadStrengthPlanPhaseTree(
        config,
        phaseDefinitions.map((entry) => entry.plan_id),
        cache,
        depth + 1
      );
    }
  }
}

function createStrengthPlanPhaseResolver(planCache) {
  function resolve(planId, weekNumber, visited = new Set()) {
    if (!planId) {
      return { planId: null, weekNumber: null, phased: false };
    }
    if (visited.has(planId)) {
      return { planId, weekNumber, phased: false };
    }

    const plan = planCache.get(planId);
    const phaseDefinitions = normalizeStrengthPhaseDefinitions(plan && plan.phase_definitions);
    if (!phaseDefinitions.length) {
      return { planId, weekNumber, phased: false };
    }

    const matchedPhase = [...phaseDefinitions]
      .reverse()
      .find((entry) => weekNumber >= entry.start_week) || phaseDefinitions[0];

    const nextVisited = new Set(visited);
    nextVisited.add(planId);
    const nested = resolve(matchedPhase.plan_id, Math.max(1, weekNumber - matchedPhase.start_week + 1), nextVisited);

    return {
      planId: nested.planId,
      weekNumber: nested.weekNumber,
      phased: true,
      phaseLabel: matchedPhase.label || nested.phaseLabel || null,
      containerPlanId: planId
    };
  }

  return resolve;
}

// ── Running volume helpers (shared with coach-running-instances.js) ──

const SESSION_TYPE_TO_VDOT_REF = {
  easy: 'easy', threshold: 'threshold', interval: 'interval',
  long: 'marathon', tempo: 'threshold', repetition: 'repetition',
  recovery: 'recovery', test: 'threshold', mobility: 'recovery', other: 'easy',
};

function round1(v) { return Math.round(Number(v) * 10) / 10; }

function toFiniteNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function resolveVdotRefPaceSecPerKm(paces, ref) {
  if (ref === 'recovery') return paces.easySlowSecPerKm;
  if (ref === 'easy') return paces.easyFastSecPerKm;
  if (ref === 'marathon') return paces.marathonSecPerKm;
  if (ref === 'threshold') return paces.thresholdSecPerKm;
  if (ref === 'interval') return paces.intervalSecPerKm;
  if (ref === 'repetition') return paces.rrSecPerKm;
  return paces.easyFastSecPerKm;
}

function buildResolvedPaceTarget(paces, prescription, fallbackRef) {
  const resolvedRef = (prescription && prescription.ref) || fallbackRef || 'easy';
  const basePace = resolveVdotRefPaceSecPerKm(paces, resolvedRef);
  const offset = Number(prescription && prescription.offset_sec_per_km);
  const range = Math.abs(Number(prescription && prescription.range_sec));
  const offsetSec = Number.isFinite(offset) ? offset : 0;
  const rangeSec = Number.isFinite(range) ? range : 0;
  const center = basePace + offsetSec;
  return {
    mode: 'vdot_reference', ref: resolvedRef,
    target_sec_per_km: round1(center),
    min_sec_per_km: round1(Math.max(120, center - rangeSec)),
    max_sec_per_km: round1(center + rangeSec),
    offset_sec_per_km: round1(offsetSec), range_sec: round1(rangeSec),
  };
}

function parseIsoDateInput(value) {
  const raw = (value || "").toString().trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return raw;
}

function buildLinearWeeklyVolumes(totalWeeks, initial, pct) {
  const factor = 1 + (toFiniteNumber(pct, 5) / 100);
  const volumes = [];
  for (let w = 1; w <= totalWeeks; w++) {
    volumes.push(round1(Math.max(5, initial * Math.pow(factor, w - 1))));
  }
  return volumes;
}

function resolveWeeklyVolumes(totalWeeks, provisioning = {}) {
  const initial = Math.max(5, toFiniteNumber(provisioning.initial_weekly_volume_km, 30));
  const pct = Math.min(20, Math.max(-5, toFiniteNumber(provisioning.weekly_progression_pct, 5)));
  const type = ['linear', 'undulating', 'block'].includes(provisioning.periodization_type)
    ? provisioning.periodization_type : 'undulating';
  if (type === 'linear') return buildLinearWeeklyVolumes(totalWeeks, initial, pct);
  return phaseWeeklyDistances(totalWeeks, initial, type);
}

function parseRequiredFinite(raw, fieldName) {
  if (raw == null || raw === '') {
    const err = new Error(`Campo obrigatório ausente: ${fieldName}`);
    err.status = 400;
    err.code = 'MISSING_RUNNING_VOLUME_CONFIG';
    err.field = fieldName;
    throw err;
  }

  const n = Number(raw);
  if (!Number.isFinite(n)) {
    const err = new Error(`Campo inválido: ${fieldName} deve ser numérico`);
    err.status = 400;
    err.code = 'INVALID_RUNNING_VOLUME_CONFIG';
    err.field = fieldName;
    throw err;
  }

  return n;
}

function parseRequiredPeriodization(raw) {
  if (raw == null || raw === '') {
    const err = new Error('Campo obrigatório ausente: periodization_type');
    err.status = 400;
    err.code = 'MISSING_RUNNING_VOLUME_CONFIG';
    err.field = 'periodization_type';
    throw err;
  }

  const value = String(raw).trim().toLowerCase();
  if (!['linear', 'undulating', 'block'].includes(value)) {
    const err = new Error('Campo inválido: periodization_type deve ser linear, undulating ou block');
    err.status = 400;
    err.code = 'INVALID_RUNNING_VOLUME_CONFIG';
    err.field = 'periodization_type';
    throw err;
  }

  return value;
}

/**
 * Creates a running_plan_instance and provisions all workout instances.
 * Returns { instanceId, workoutInstancesByKey } where key = `${weekNumber}::${sessionKey}`
 */
async function provisionRunningPlanForAthlete(config, {
  planTemplateId,
  athleteId,
  assignmentId,
  startDate,
  initialWeeklyVolumeKm,
  weeklyProgressionPct,
  periodizationType,
  currentVdot,
}) {
  const template = await getRunningPlanTemplateById(config, planTemplateId);
  if (!template) throw new Error(`Running plan template ${planTemplateId} not found`);

  const paces = calculatePaces(currentVdot);

  const provisioning = {
    initial_weekly_volume_km: Number(initialWeeklyVolumeKm.toFixed(1)),
    weekly_progression_pct: Number(weeklyProgressionPct.toFixed(2)),
    periodization_type: periodizationType,
  };

  // Check for existing active instance for this athlete+template
  const existingInstance = await getActiveRunningPlanInstance(config, athleteId);
  let instance;
  if (existingInstance && existingInstance.plan_template_id === planTemplateId) {
    instance = existingInstance;
    // Update provisioning config
    await updateRunningPlanInstance(config, instance.id, {
      plan_snapshot: {
        ...(instance.plan_snapshot || {}),
        provisioning,
        assigned_at: new Date().toISOString(),
      },
      current_vdot: currentVdot,
      current_threshold_pace_sec_per_km: paces.thresholdSecPerKm,
    });
  } else {
    instance = await createRunningPlanInstance(config, {
      plan_template_id: planTemplateId,
      athlete_id: athleteId,
      program_assignment_id: assignmentId,
      start_date: startDate,
      status: 'active',
      engine_version: ENGINE_VERSION,
      current_vdot: currentVdot,
      current_threshold_pace_sec_per_km: paces.thresholdSecPerKm,
      plan_snapshot: {
        template_id: planTemplateId,
        template_name: template.name,
        total_weeks: template.total_weeks,
        provisioning,
        assigned_at: new Date().toISOString(),
      },
    });
  }

  if (!instance || !instance.id) throw new Error('Failed to create running plan instance');

  // Load template sessions and provision workout instances
  const templateSessions = await listRunningPlanTemplateSessions(config, planTemplateId);
  const weeklyVolumes = resolveWeeklyVolumes(template.total_weeks, provisioning);
  const volumeDistributionMode = ['automatic', 'manual'].includes(
    String(template.default_volume_distribution_mode || '').trim().toLowerCase()
  )
    ? String(template.default_volume_distribution_mode).trim().toLowerCase()
    : 'automatic';

  const stepsCache = new Map();
  const sessionsByWeek = new Map();
  for (const ts of templateSessions) {
    const wk = Number(ts.week_number);
    if (!sessionsByWeek.has(wk)) sessionsByWeek.set(wk, []);
    sessionsByWeek.get(wk).push(ts);
  }

  const workouts = [];
  for (const [weekNumber, weekSessions] of sessionsByWeek.entries()) {
    const weeklyVolumeKm = weeklyVolumes[Math.max(0, weekNumber - 1)] || weeklyVolumes[weeklyVolumes.length - 1] || 30;

    const declaredPctTotal = weekSessions.reduce((acc, s) => {
      const pct = toFiniteNumber(s?.progression_rule?.weekly_volume_pct, 0);
      return pct > 0 ? acc + pct : acc;
    }, 0);

    if (volumeDistributionMode === 'automatic') {
      const missingPctSession = weekSessions.find((s) => toFiniteNumber(s?.progression_rule?.weekly_volume_pct, 0) <= 0);
      if (missingPctSession) {
        const err = new Error(`Sessão sem weekly_volume_pct na semana ${weekNumber} (session_key=${missingPctSession.session_key})`);
        err.status = 400;
        err.code = 'MISSING_WEEKLY_VOLUME_PCT';
        err.week_number = weekNumber;
        err.session_key = missingPctSession.session_key;
        throw err;
      }
      if (Math.abs(declaredPctTotal - 100) > 0.25) {
        const err = new Error(`Soma de weekly_volume_pct inválida na semana ${weekNumber}: ${declaredPctTotal.toFixed(2)}% (esperado 100%)`);
        err.status = 400;
        err.code = 'INVALID_WEEKLY_VOLUME_PCT_SUM';
        err.week_number = weekNumber;
        err.declared_total_pct = Number(declaredPctTotal.toFixed(2));
        throw err;
      }
    }

    for (const ts of weekSessions) {
      const fallbackRef = SESSION_TYPE_TO_VDOT_REF[ts.session_type] || 'easy';
      const declaredPct = toFiniteNumber(ts?.progression_rule?.weekly_volume_pct, 0);
      const sessionPct = volumeDistributionMode === 'automatic'
        ? declaredPct
        : 100 / Math.max(1, weekSessions.length);
      const sessionKm = weeklyVolumeKm * (sessionPct / 100);

      let steps = [];
      if (ts.workout_template_id) {
        if (!stepsCache.has(ts.workout_template_id)) {
          const loaded = await listRunningWorkoutTemplateSteps(config, ts.workout_template_id);
          stepsCache.set(ts.workout_template_id, Array.isArray(loaded) ? loaded : []);
        }
        steps = stepsCache.get(ts.workout_template_id) || [];
      }

      const isManual = String(
        steps[0]?.export_hint?.volume_mode || ''
      ).toLowerCase() === 'manual';

      if (volumeDistributionMode === 'manual' && !isManual) {
        const err = new Error(`Sessão ${ts.session_key} está em modo automático de steps mas o plano está em modo manual`);
        err.status = 400;
        err.code = 'MISMATCH_VOLUME_DISTRIBUTION_MODE';
        err.week_number = weekNumber;
        err.session_key = ts.session_key;
        throw err;
      }

      const stepPctTotal = steps.reduce((acc, step) => {
        const pct = toFiniteNumber(step?.export_hint?.step_volume_pct, 0);
        return pct > 0 ? acc + pct : acc;
      }, 0);

      const resolvedSteps = steps.map((step, idx) => {
        const stepPct = isManual ? null
          : (stepPctTotal > 0
            ? (toFiniteNumber(step?.export_hint?.step_volume_pct, 0) / stepPctTotal) * 100
            : 100 / Math.max(1, steps.length));
        const stepKm = isManual ? null : (sessionKm * (stepPct / 100));

        const rawPx = typeof step.prescription_payload === 'object' ? step.prescription_payload : {};
        const usePace = step.target_type === 'pace';
        const paceTarget = usePace ? buildResolvedPaceTarget(paces, rawPx, fallbackRef) : null;

        const manualDist = Number(step.distance_meters);
        const manualDur = Number(step.duration_seconds);
        const distM = isManual
          ? (Number.isFinite(manualDist) && manualDist > 0 ? Math.round(manualDist) : null)
          : Math.max(0, Math.round(stepKm * 1000));
        let durS = null;
        if (isManual) {
          durS = Number.isFinite(manualDur) && manualDur > 0 ? Math.round(manualDur) : null;
        } else if (paceTarget && stepKm > 0) {
          durS = Math.max(1, Math.round(stepKm * paceTarget.target_sec_per_km));
        }

        return {
          step_order: Number(step.step_order) || (idx + 1),
          step_type: step.step_type,
          target_type: step.target_type || 'none',
          step_volume_pct: stepPct == null ? null : round1(stepPct),
          step_volume_km: stepKm == null ? null : round1(stepKm),
          distance_meters: distM,
          duration_seconds: durS,
          repeat_count: step.repeat_count || null,
          pace_target: paceTarget,
          instruction_text: step.instruction_text || null,
        };
      });

      const firstPace = resolvedSteps.find((s) => s?.pace_target);
      const paceTarget = firstPace ? firstPace.pace_target : buildResolvedPaceTarget(paces, null, fallbackRef);

      workouts.push({
        running_plan_instance_id: instance.id,
        week_number: weekNumber,
        session_key: ts.session_key,
        session_type: ts.session_type,
        workout_template_id: ts.workout_template_id || null,
        vdot_used: currentVdot,
        threshold_pace_sec_per_km_used: paces.thresholdSecPerKm,
        resolved_targets: {
          pace_target: paceTarget, paces,
          volume_mode: isManual ? 'manual' : 'automatic',
          session_volume_mode: volumeDistributionMode,
          weekly_volume_km: round1(weeklyVolumeKm),
          session_volume_pct: isManual ? null : round1(sessionPct),
          session_volume_km: isManual ? null : round1(sessionKm),
          resolved_steps: resolvedSteps,
          prescription: {
            mode: 'vdot_reference', ref: paceTarget.ref,
            offset_sec_per_km: paceTarget.offset_sec_per_km,
            range_sec: paceTarget.range_sec,
          },
        },
        status: 'planned',
        recalculation_policy: 'future_only',
      });
    }
  }

  let createdWorkouts = [];
  if (workouts.length > 0) {
    createdWorkouts = await insertRunningWorkoutInstances(config, workouts);
  }

  // Build a lookup: weekNumber::sessionType → workout instance id
  const workoutInstancesByKey = new Map();
  for (const wi of createdWorkouts) {
    workoutInstancesByKey.set(`${wi.week_number}::${wi.session_key}`, wi.id);
    // Also index by session_type for fallback matching
    const typeKey = `${wi.week_number}::type::${wi.session_type}`;
    if (!workoutInstancesByKey.has(typeKey)) {
      workoutInstancesByKey.set(typeKey, wi.id);
    }
  }

  return { instanceId: instance.id, workoutInstancesByKey };
}

/**
 * Generates athlete_weekly_plan rows from a preset + assignment data.
 * strengthInstanceMap: Map<strength_plan_id, instance_id>
 */
function generateWeeklyPlanRows({
  athleteId,
  assignmentId,
  totalWeeks,
  startDate,
  slots,
  sessions,
  strengthInstanceMap,
  runningInstanceMap,
  source,
  presetId,
  variantId,
  fromWeek,
  resolveStrengthPlanForWeek
}) {
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const sessionStartWeekMap = new Map();
  const rows = [];
  const effectiveFromWeek = fromWeek || 1;
  const effectiveStartDate = startDate;
  const normalizedStartDate = getWeekStartIso(startDate) || startDate;

  for (const slot of slots) {
    const week = Number(slot.week_number || 1);
    if (!Number.isInteger(week) || week < 1) continue;
    const existing = sessionStartWeekMap.get(slot.session_id);
    if (existing == null || week < existing) {
      sessionStartWeekMap.set(slot.session_id, week);
    }
  }

  for (const slot of slots) {
    const week = Number(slot.week_number || 1);
    if (!Number.isInteger(week) || week < effectiveFromWeek || week > totalWeeks) continue;

    const session = sessionMap.get(slot.session_id);
    if (!session) continue;

    // Use slot-level plan IDs (may be overridden by variant in enriched slots)
    const baseStrengthPlanId = slot.strength_plan_id || session.strength_plan_id;
    const effectiveRunningTemplateId = slot.running_plan_template_id || session.running_plan_template_id;
    const phasedStrengthResolution = session.session_type === "strength" && baseStrengthPlanId && resolveStrengthPlanForWeek
      ? resolveStrengthPlanForWeek(baseStrengthPlanId, week)
      : null;
    const effectiveStrengthPlanId = phasedStrengthResolution && phasedStrengthResolution.planId
      ? phasedStrengthResolution.planId
      : baseStrengthPlanId;
    const baseStrengthWeek = Number(slot.strength_week_number || session.strength_week_number || 1);
    const sessionStartWeek = sessionStartWeekMap.get(slot.session_id) || week;
    const effectiveStrengthWeekNumber = session.session_type === "strength" && effectiveStrengthPlanId
      ? (
        phasedStrengthResolution && phasedStrengthResolution.phased
          ? phasedStrengthResolution.weekNumber
          : Math.max(1, (Number.isInteger(baseStrengthWeek) ? baseStrengthWeek : 1) + Math.max(0, week - sessionStartWeek))
      )
      : null;

    // Calculate week_start_date from the Monday of the assignment's ISO week.
    const weekStartDate = new Date(`${normalizedStartDate}T00:00:00.000Z`);
    weekStartDate.setDate(weekStartDate.getDate() + (week - 1) * 7);
    const weekStartStr = weekStartDate.toISOString().slice(0, 10);
    const slotDate = new Date(`${weekStartStr}T00:00:00.000Z`);
    slotDate.setDate(slotDate.getDate() + Number(slot.day_of_week || 0));
    const slotDateStr = slotDate.toISOString().slice(0, 10);

    if (week === 1 && slotDateStr < effectiveStartDate) {
      continue;
    }

    // Resolve running instance links
    let runningPlanInstanceId = null;
    let runningWorkoutInstanceId = null;
    if (session.session_type === "running" && effectiveRunningTemplateId && runningInstanceMap) {
      const riEntry = runningInstanceMap.get(effectiveRunningTemplateId);
      if (riEntry) {
        runningPlanInstanceId = riEntry.instanceId;
        // Match by session_key first, then by session_type
        const byKey = riEntry.workoutInstancesByKey;
        runningWorkoutInstanceId =
          byKey.get(`${week}::${session.session_key}`) ||
          byKey.get(`${week}::type::${session.running_session_type || session.session_type}`) ||
          null;
      }
    }

    const row = {
      athlete_id: athleteId,
      program_assignment_id: assignmentId,
      week_number: week,
      week_start_date: weekStartStr,
      day_of_week: slot.day_of_week,
      time_slot: slot.time_slot,
      session_key: session.session_key,
      session_type: session.session_type,
      session_label: session.session_label,
      duration_estimate_min: session.duration_estimate_min,
      intensity: session.intensity,
      strength_instance_id: session.session_type === "strength" && effectiveStrengthPlanId && strengthInstanceMap
        ? (strengthInstanceMap.get(effectiveStrengthPlanId) || null)
        : null,
      strength_week_number: effectiveStrengthWeekNumber,
      strength_day_number: session.strength_day_number || null,
      running_plan_instance_id: runningPlanInstanceId,
      running_workout_instance_id: runningWorkoutInstanceId,
      running_session_data: null,
      is_optional: session.is_optional === true,
      source: source || (variantId ? "variant" : "preset"),
      status: "planned",
      generated_from_preset_id: presetId || null,
      generated_from_variant_id: variantId || null
    };

    rows.push(row);
  }

  return rows;
}

exports.handler = async (event) => {
  const config = getConfig();
  const auth = await requireAuthenticatedUser(event, config);
  if (auth.error) return auth.error;

  try {
    const qs = event.queryStringParameters || {};

    // ── GET: list athlete weekly plan ──
    if (event.httpMethod === "GET") {
      const assignmentId = qs.assignmentId || qs.programAssignmentId;
      let athleteId = qs.athleteId;

      // If no athleteId provided, use authenticated user's athlete record
      if (!athleteId) {
        const athlete = await getAthleteByIdentity(config, auth.user.sub);
        if (athlete) athleteId = athlete.id;
      }

      if (!athleteId) {
        return json(400, { error: "athleteId is required" });
      }

      const weekNumber = qs.weekNumber != null ? Number(qs.weekNumber) : undefined;
      let plan = await listAthleteWeeklyPlan(config, {
        athleteId,
        programAssignmentId: assignmentId || undefined,
        weekNumber: Number.isInteger(weekNumber) ? weekNumber : undefined
      });

      // Optional filter by instanceId (strength_instance_id)
      const instanceId = qs.instanceId;
      if (instanceId && Array.isArray(plan)) {
        plan = plan.filter(
          (r) => r.strength_instance_id === instanceId || r.session_type !== "strength"
        );
      }

      return json(200, { plan: plan || [] });
    }

    // ── POST: generate weekly plan from preset and/or variant ──
    if (event.httpMethod === "POST") {
      const body = parseJsonBody(event);

      const assignmentId = (body.assignment_id || body.program_assignment_id || "").toString().trim();
      if (!assignmentId) {
        return json(400, { error: "assignment_id is required" });
      }

      const presetId = (body.preset_id || "").toString().trim() || null;
      const variantId = (body.variant_id || "").toString().trim() || null;

      if (!presetId && !variantId) {
        return json(400, { error: "preset_id or variant_id is required" });
      }

      // Load assignment
      const assignment = await getProgramAssignmentById(config, assignmentId);
      if (!assignment) {
        return json(404, { error: "Assignment not found" });
      }

      // Verify authorized: coach or own athlete
      const roles = Array.isArray(auth.roles) ? auth.roles : [];
      const isCoachOrAdmin = roles.includes("coach") || roles.includes("admin");
      if (!isCoachOrAdmin) {
        const athlete = await getAthleteByIdentity(config, auth.user.sub);
        if (!athlete || athlete.id !== assignment.athlete_id) {
          return json(403, { error: "Forbidden" });
        }
      }

      // ── Load variant metadata (if variant-based) ──
      let variant = null;
      if (variantId) {
        variant = await getVariantById(config, variantId);
        if (!variant) {
          return json(404, { error: "Variant not found" });
        }
        // Verify variant belongs to the same program
        if (variant.training_program_id !== assignment.training_program_id) {
          return json(400, { error: "Variant does not belong to the assigned program" });
        }
      }

      const variantPresetLinks = variantId
        ? await listVariantPresetLinks(config, variantId)
        : [];

      // ── Load preset for schedule layout (slots) ──
      // Preset is required for slot layout. If only variant_id was provided,
      // try using the assignment's existing preset or program's default.
      let effectivePresetId = presetId;
      if (!effectivePresetId && assignment.selected_preset_id) {
        effectivePresetId = assignment.selected_preset_id;
      }
      if (!effectivePresetId && variantPresetLinks.length > 0) {
        const defaultLink = variantPresetLinks.find((link) => link.is_default === true) || variantPresetLinks[0];
        effectivePresetId = defaultLink && defaultLink.preset_id ? defaultLink.preset_id : null;
      }
      if (!effectivePresetId) {
        return json(400, {
          error: "preset_id is required for schedule layout (variant provides plan bindings, preset provides day/time slots)",
          code: "MISSING_PRESET_FOR_LAYOUT"
        });
      }

      if (variant && variantPresetLinks.length > 0) {
        const isCompatiblePreset = variantPresetLinks.some((link) => link.preset_id === effectivePresetId);
        if (!isCompatiblePreset) {
          return json(400, {
            error: "The selected preset is not compatible with this variant",
            code: "INCOMPATIBLE_PRESET_FOR_VARIANT",
            preset_id: effectivePresetId,
            variant_id: variantId
          });
        }
      }

      const preset = await getProgramSchedulePresetById(config, effectivePresetId);
      if (!preset) {
        return json(404, { error: "Preset not found" });
      }

      const slots = await listProgramScheduleSlots(config, effectivePresetId);
      if (!slots || slots.length === 0) {
        return json(400, { error: "Preset has no slots configured" });
      }

      // Load sessions for the program
      const sessions = await listProgramWeeklySessions(config, assignment.training_program_id);
      if (!sessions || sessions.length === 0) {
        return json(400, { error: "Program has no sessions defined" });
      }

      // When variant is used, it can override duration_weeks
      const totalWeeks = variant
        ? (variant.duration_weeks || assignment.duration_weeks || 12)
        : (assignment.duration_weeks || 12);
      const todayIso = new Date().toISOString().slice(0, 10);
      const assignmentStartDate = assignment.start_date || todayIso;
      const requestedStartDate = parseIsoDateInput(body.start_date);
      if (body.start_date != null && !requestedStartDate) {
        return json(400, {
          error: "start_date tem de ser uma data ISO válida (YYYY-MM-DD).",
          code: "INVALID_START_DATE"
        });
      }

      const defaultSource = variant
        ? "variant"
        : (isCoachOrAdmin ? "preset" : "athlete_setup");
      const source = body.source || defaultSource;
      const fromWeek = body.from_week != null ? Number(body.from_week) : null;
      const effectiveStartWeek = fromWeek && Number.isInteger(fromWeek) && fromWeek > 0 ? fromWeek : 1;
      const existingPlanRows = await listAthleteWeeklyPlan(config, {
        athleteId: assignment.athlete_id,
        programAssignmentId: assignment.id
      });
      const hasExistingPlan = Array.isArray(existingPlanRows) && existingPlanRows.length > 0;
      let startDate = assignmentStartDate;
      if (!hasExistingPlan && effectiveStartWeek === 1) {
        const anchorDate = assignmentStartDate > todayIso ? assignmentStartDate : todayIso;
        if (requestedStartDate) {
          if (requestedStartDate < anchorDate) {
            return json(400, {
              error: "A data de início tem de ser hoje ou futura e não pode ser anterior ao arranque do assignment.",
              code: "INVALID_START_DATE_RANGE",
              min_start_date: anchorDate,
            });
          }
          startDate = requestedStartDate;
        } else {
          startDate = getCurrentOrNextWeekStartIso(anchorDate)
            || getWeekStartIso(anchorDate)
            || assignmentStartDate;
        }

        if (startDate !== assignment.start_date) {
          try {
            await updateProgramAssignment(config, assignment.id, {
              start_date: startDate,
              status: startDate > todayIso ? "scheduled" : "active"
            });
            assignment.start_date = startDate;
            assignment.status = startDate > todayIso ? "scheduled" : "active";
          } catch (_err) {
            console.error("Failed to align assignment start_date to calendar anchor:", _err.message);
          }
        }
      }

      const strengthPlanCache = new Map();
      await loadStrengthPlanPhaseTree(
        config,
        [
          variant && variant.strength_plan_id ? variant.strength_plan_id : null,
          ...sessions.filter((session) => session.session_type === "strength" && session.strength_plan_id).map((session) => session.strength_plan_id)
        ].filter(Boolean),
        strengthPlanCache
      );
      const resolveStrengthPlanForWeek = createStrengthPlanPhaseResolver(strengthPlanCache);
      const sessionMap = new Map(sessions.map((session) => [session.id, session]));

      // ── Resolve plan bindings ──
      // Variant overrides: uses variant's strength plan container for ALL strength sessions,
      // resolving the effective phase plan by week when needed.
      let resolvedStrengthPlanIds;
      let resolvedRunningTemplateIds;

      const strengthWeeksToProvision = (slots || [])
        .map((slot) => {
          const session = sessionMap.get(slot.session_id);
          if (!session || session.session_type !== "strength") return null;
          return {
            planId: variant && variant.strength_plan_id ? variant.strength_plan_id : session.strength_plan_id,
            weekNumber: Number(slot.week_number || 1)
          };
        })
        .filter((entry) => entry && entry.planId && Number.isInteger(entry.weekNumber) && entry.weekNumber >= effectiveStartWeek && entry.weekNumber <= totalWeeks);

      resolvedStrengthPlanIds = [...new Set(
        strengthWeeksToProvision
          .map((entry) => resolveStrengthPlanForWeek(entry.planId, entry.weekNumber).planId)
          .filter(Boolean)
      )];

      if (variant) {
        resolvedRunningTemplateIds = variant.running_plan_template_id ? [variant.running_plan_template_id] : [];
      } else {
        resolvedRunningTemplateIds = [...new Set(
          sessions
            .filter(s => s.session_type === "running" && s.running_plan_template_id)
            .map(s => s.running_plan_template_id)
        )];
      }

      // Create/find strength instances
      const strengthInstanceMap = new Map();
      const program = await getTrainingProgramById(config, assignment.training_program_id);

      if (resolvedStrengthPlanIds.length > 0) {
        const existingInstances = await listStrengthPlanInstances(config, {
          athleteId: assignment.athlete_id,
          status: "active"
        });

        for (const strengthPlanId of resolvedStrengthPlanIds) {
          const existing = Array.isArray(existingInstances)
            && existingInstances.find(inst => inst.plan_id === strengthPlanId);

          if (existing) {
            strengthInstanceMap.set(strengthPlanId, existing.id);
          } else {
            try {
              const instance = await createStrengthPlanInstance(config, {
                plan_id: strengthPlanId,
                athlete_id: assignment.athlete_id,
                start_date: startDate,
                load_round: 2.5,
                status: "active",
                assigned_by: assignment.coach_id,
                program_assignment_id: assignment.id,
                coach_locked_until: null,
                access_model: program ? program.access_model : null,
                plan_snapshot: null
              });
              if (instance && instance.id) {
                strengthInstanceMap.set(strengthPlanId, instance.id);
              }
            } catch (_err) {
              console.error(`Failed to create strength instance for plan ${strengthPlanId}:`, _err.message);
            }
          }
        }
      }

      // Create/find running plan instances
      const runningInstanceMap = new Map();

      if (resolvedRunningTemplateIds.length > 0) {
        // Running requires VDOT
        const vdotRecord = await getCurrentRunningVdot(config, assignment.athlete_id);
        if (!vdotRecord || !vdotRecord.vdot) {
          return json(400, {
            error: "O atleta não tem VDOT definido. Define o VDOT antes de aplicar o preset.",
            code: "MISSING_VDOT"
          });
        }
        const currentVdot = Number(vdotRecord.vdot);

        // Running volume config: from variant's running_config_preset JSONB, or from body params
        let initialWeeklyVolumeKm, weeklyProgressionPct, periodizationType;

        if (variant && variant.running_config_preset) {
          const rc = variant.running_config_preset;
          initialWeeklyVolumeKm = parseRequiredFinite(
            rc.initial_weekly_volume_km ?? body.initial_weekly_volume_km ?? body.initialWeeklyVolumeKm,
            'initial_weekly_volume_km'
          );
          weeklyProgressionPct = parseRequiredFinite(
            rc.weekly_progression_pct ?? body.weekly_progression_pct ?? body.weeklyProgressionPct,
            'weekly_progression_pct'
          );
          periodizationType = parseRequiredPeriodization(
            rc.periodization_type ?? body.periodization_type ?? body.periodizationType
          );
        } else {
          initialWeeklyVolumeKm = parseRequiredFinite(
            body.initial_weekly_volume_km ?? body.initialWeeklyVolumeKm,
            'initial_weekly_volume_km'
          );
          weeklyProgressionPct = parseRequiredFinite(
            body.weekly_progression_pct ?? body.weeklyProgressionPct,
            'weekly_progression_pct'
          );
          periodizationType = parseRequiredPeriodization(
            body.periodization_type ?? body.periodizationType
          );
        }

        if (initialWeeklyVolumeKm < 5 || initialWeeklyVolumeKm > 300) {
          return json(400, {
            error: 'initial_weekly_volume_km deve estar entre 5 e 300.',
            code: 'INVALID_RUNNING_VOLUME_CONFIG',
            field: 'initial_weekly_volume_km',
            min: 5,
            max: 300,
          });
        }
        if (weeklyProgressionPct < -5 || weeklyProgressionPct > 20) {
          return json(400, {
            error: 'weekly_progression_pct deve estar entre -5 e 20.',
            code: 'INVALID_RUNNING_VOLUME_CONFIG',
            field: 'weekly_progression_pct',
            min: -5,
            max: 20,
          });
        }

        for (const planTemplateId of resolvedRunningTemplateIds) {
          try {
            const result = await provisionRunningPlanForAthlete(config, {
              planTemplateId,
              athleteId: assignment.athlete_id,
              assignmentId: assignment.id,
              startDate,
              initialWeeklyVolumeKm,
              weeklyProgressionPct,
              periodizationType,
              currentVdot,
            });
            runningInstanceMap.set(planTemplateId, result);
          } catch (_err) {
            console.error(`Failed to provision running plan ${planTemplateId}:`, _err.message);
            const status = Number(_err && _err.status) || 500;
            const code = _err && _err.code ? _err.code : 'RUNNING_PROVISION_FAILED';
            return json(status, {
              error: `Falha ao provisionar plano de corrida ${planTemplateId}`,
              code,
              plan_template_id: planTemplateId,
              week_number: _err && _err.week_number ? _err.week_number : undefined,
              session_key: _err && _err.session_key ? _err.session_key : undefined,
              declared_total_pct: _err && _err.declared_total_pct != null ? _err.declared_total_pct : undefined,
              detail: _err.message,
            });
          }
        }
      }

      // ── Enrich slots with session data for proper identification ──
      const enrichedSlots = (slots || []).map(slot => {
        const session = sessionMap.get(slot.session_id);
        if (!session) {
          console.warn(
            `⚠️  Preset slot ${slot.id} references missing session ${slot.session_id}. ` +
            `Preset will have incomplete session data for this slot.`
          );
          return slot;
        }

        // When using variant, override plan bindings in enriched slots
        const baseStrengthPlanId = (variant && variant.strength_plan_id && session.session_type === "strength")
          ? variant.strength_plan_id
          : session.strength_plan_id;
        const phasedStrengthResolution = session.session_type === "strength" && baseStrengthPlanId
          ? resolveStrengthPlanForWeek(baseStrengthPlanId, Number(slot.week_number || 1))
          : null;
        const effectiveStrengthPlanId = phasedStrengthResolution && phasedStrengthResolution.planId
          ? phasedStrengthResolution.planId
          : baseStrengthPlanId;
        const effectiveRunningTemplateId = (variant && variant.running_plan_template_id && session.session_type === "running")
          ? variant.running_plan_template_id
          : session.running_plan_template_id;

        return {
          ...slot,
          session_key: session.session_key,
          session_type: session.session_type,
          session_label: session.session_label,
          duration_estimate_min: session.duration_estimate_min,
          intensity: session.intensity,
          strength_plan_id: effectiveStrengthPlanId,
          strength_phase_label: phasedStrengthResolution && phasedStrengthResolution.phaseLabel ? phasedStrengthResolution.phaseLabel : null,
          strength_week_number: session.strength_week_number,
          strength_day_number: session.strength_day_number,
          running_plan_template_id: effectiveRunningTemplateId,
          running_session_type: session.running_session_type,
        };
      });

      const planRows = generateWeeklyPlanRows({
        athleteId: assignment.athlete_id,
        assignmentId: assignment.id,
        totalWeeks,
        startDate,
        slots: enrichedSlots,
        sessions,
        strengthInstanceMap,
        runningInstanceMap,
        source,
        presetId: effectivePresetId,
        variantId,
        fromWeek: effectiveStartWeek,
        resolveStrengthPlanForWeek
      });

      // Delete existing plan: full or partial (from_week onwards)
      if (effectiveStartWeek > 1) {
        await deleteAthleteWeeklyPlanFromWeek(config, assignmentId, effectiveStartWeek);
      } else {
        await deleteAthleteWeeklyPlan(config, assignmentId);
      }

      // Insert new plan rows in batches of 200
      const inserted = [];
      for (let i = 0; i < planRows.length; i += 200) {
        const batch = planRows.slice(i, i + 200);
        const result = await insertAthleteWeeklyPlanRows(config, batch);
        if (Array.isArray(result)) inserted.push(...result);
      }

      // Link preset and/or variant to the assignment
      try {
        await setAssignmentPreset(config, assignmentId, effectivePresetId);
      } catch (_err) {
        console.error("Failed to link preset to assignment:", _err.message);
      }
      if (variantId) {
        try {
          await setAssignmentVariant(config, assignmentId, variantId);
        } catch (_err) {
          console.error("Failed to link variant to assignment:", _err.message);
        }
      }

      return json(201, {
        generated: inserted.length,
        totalWeeks,
        presetName: preset.preset_name,
        variantId: variantId || null,
        slotsPerWeek: slots.length,
        instancesCreated: strengthInstanceMap.size,
        runningInstancesCreated: runningInstanceMap.size,
      });
    }

    // ── PATCH: update individual plan row (coach override or status change) ──
    if (event.httpMethod === "PATCH") {
      const body = parseJsonBody(event);
      const rowId = (body.id || body.row_id || "").toString().trim();
      if (!rowId) {
        return json(400, { error: "id (row_id) is required" });
      }

      const existing = await getAthleteWeeklyPlanRowById(config, rowId);
      if (!existing) {
        return json(404, { error: "Plan row not found" });
      }

      const roles = Array.isArray(auth.roles) ? auth.roles : [];
      const isCoachOrAdmin = roles.includes("coach") || roles.includes("admin");
      if (!isCoachOrAdmin) {
        const athlete = await getAthleteByIdentity(config, auth.user.sub);
        if (!athlete || athlete.id !== existing.athlete_id) {
          return json(403, { error: "Não autorizado para editar esta sessão" });
        }
      }

      const patch = {};
      if (body.status != null) {
        const validStatuses = ["planned", "completed", "skipped", "moved"];
        if (!validStatuses.includes(body.status)) {
          return json(400, { error: `status must be one of: ${validStatuses.join(", ")}` });
        }
        patch.status = body.status;
      }
      if (body.coach_notes !== undefined) {
        patch.coach_notes = body.coach_notes || null;
      }
      if (body.session_label != null) patch.session_label = body.session_label;
      if (body.duration_estimate_min !== undefined) patch.duration_estimate_min = body.duration_estimate_min;
      if (body.intensity !== undefined) patch.intensity = body.intensity;

      if (body.day_of_week !== undefined) {
        const dayOfWeek = Number(body.day_of_week);
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
          return json(400, { error: "day_of_week must be an integer between 0 and 6" });
        }
        patch.day_of_week = dayOfWeek;
      }

      // Mark as coach override if coach is making changes
      if (isCoachOrAdmin) {
        if (body.source != null) {
          patch.source = body.source;
        } else if (Object.keys(patch).length > 0 && !patch.status) {
          patch.source = "coach_override";
        }
      } else if (patch.day_of_week !== undefined) {
        patch.source = "athlete_move";
      }

      if (Object.keys(patch).length === 0) {
        return json(400, { error: "No valid fields to update" });
      }

      try {
        const updated = await updateAthleteWeeklyPlanRow(config, rowId, patch);
        return json(200, { row: updated });
      } catch (patchErr) {
        // Unique constraint collision when moving to an occupied day/slot.
        if (patchErr && patchErr.payload && patchErr.payload.code === "23505") {
          return json(409, { error: "Já existe uma sessão nesse dia e slot." });
        }
        throw patchErr;
      }
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal server error" });
  }
};
