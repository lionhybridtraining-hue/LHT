/**
 * coach-running-instances.js
 * Coach endpoint for viewing and managing running plan instances for athletes
 *
 * Routes:
 * GET /coach-running-instances?instanceId=<id> — Get single instance with workouts
 * PATCH /coach-running-instances — Update instance (pause/resume/provision)
 */

const { json, parseJsonBody } = require('./_lib/http');
const { getConfig } = require('./_lib/config');
const { requireAuthenticatedUser } = require('./_lib/authz');
const {
  listRunningWorkoutInstances,
  listRunningWorkoutTemplateSteps,
  insertRunningWorkoutInstances,
  updateRunningPlanInstance,
  getRunningPlanInstanceById,
  getRunningPlanTemplateById,
  listRunningPlanInstancesByTemplate,
  listRunningPlanTemplateSessions,
  verifyCoachOwnsAthlete,
} = require('./_lib/supabase');
const {
  calculatePaces,
  phaseWeeklyDistances,
} = require('./_lib/running-engine');

const SESSION_TYPE_TO_VDOT_REF = {
  easy: 'easy',
  threshold: 'threshold',
  interval: 'interval',
  long: 'marathon',
  tempo: 'threshold',
  repetition: 'repetition',
  recovery: 'recovery',
  test: 'threshold',
  mobility: 'recovery',
  other: 'easy',
};

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
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
    mode: 'vdot_reference',
    ref: resolvedRef,
    target_sec_per_km: round1(center),
    min_sec_per_km: round1(Math.max(120, center - rangeSec)),
    max_sec_per_km: round1(center + rangeSec),
    offset_sec_per_km: round1(offsetSec),
    range_sec: round1(rangeSec),
  };
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildLinearWeeklyVolumes(totalWeeks, initialWeeklyVolumeKm, weeklyProgressionPct) {
  const safeInitial = Math.max(5, toFiniteNumber(initialWeeklyVolumeKm, 30));
  const progressionFactor = 1 + (toFiniteNumber(weeklyProgressionPct, 5) / 100);
  const volumes = [];
  for (let week = 1; week <= totalWeeks; week++) {
    const value = safeInitial * Math.pow(progressionFactor, week - 1);
    volumes.push(round1(Math.max(5, value)));
  }
  return volumes;
}

function resolveWeeklyVolumes(totalWeeks, provisioning = {}) {
  const initialWeeklyVolumeKm = Math.max(5, toFiniteNumber(provisioning.initial_weekly_volume_km, 30));
  const weeklyProgressionPct = Math.min(20, Math.max(-5, toFiniteNumber(provisioning.weekly_progression_pct, 5)));
  const periodizationType = ['linear', 'undulating', 'block'].includes(provisioning.periodization_type)
    ? provisioning.periodization_type
    : 'undulating';

  if (periodizationType === 'linear') {
    return buildLinearWeeklyVolumes(totalWeeks, initialWeeklyVolumeKm, weeklyProgressionPct);
  }

  return phaseWeeklyDistances(totalWeeks, initialWeeklyVolumeKm, periodizationType);
}

exports.handler = async (event) => {
  const config = getConfig();
  const auth = await requireAuthenticatedUser(event, config);
  if (auth.error) return auth.error;

  const roles = Array.isArray(auth.roles) ? auth.roles : [];
  const isCoach = roles.includes('coach');
  const isAdmin = roles.includes('admin');
  if (!isCoach && !isAdmin) {
    return json(403, { error: 'Forbidden' });
  }

  const coachId = auth.user.sub;

  try {
    if (event.httpMethod === 'GET') {
      const qs = event.queryStringParameters || {};

      // List instances for a plan template
      if (qs.plan_template_id) {
        const instances = await listRunningPlanInstancesByTemplate(config, qs.plan_template_id);
        return json(200, { instances });
      }

      if (!qs.instanceId) {
        return json(400, { error: 'instanceId or plan_template_id query param is required' });
      }

      const instance = await getRunningPlanInstanceById(config, qs.instanceId);
      if (!instance) return json(404, { error: 'Instance not found' });

      // Verify ownership
      if (!isAdmin) {
        const owns = await verifyCoachOwnsAthlete(config, coachId, instance.athlete_id);
        if (!owns) return json(403, { error: 'Forbidden' });
      }

      const template = await getRunningPlanTemplateById(config, instance.plan_template_id);
      const workouts = await listRunningWorkoutInstances(config, qs.instanceId);

      return json(200, {
        instance: { ...instance, template },
        workouts,
        count: workouts.length,
      });
    }

    if (event.httpMethod === 'PATCH') {
      const body = parseJsonBody(event);
      const { instanceId, action, status } = body;

      if (!instanceId) return json(400, { error: 'instanceId is required' });

      const instance = await getRunningPlanInstanceById(config, instanceId);
      if (!instance) return json(404, { error: 'Instance not found' });

      // Verify ownership
      if (!isAdmin) {
        const owns = await verifyCoachOwnsAthlete(config, coachId, instance.athlete_id);
        if (!owns) return json(403, { error: 'Forbidden' });
      }

      if (action === 'pause') {
        const updated = await updateRunningPlanInstance(config, instanceId, { status: 'paused' });
        return json(200, { instance: updated, message: 'Plan paused' });
      }

      if (action === 'resume') {
        const updated = await updateRunningPlanInstance(config, instanceId, { status: 'active' });
        return json(200, { instance: updated, message: 'Plan resumed' });
      }

      if (action === 'update_status') {
        if (!status || !['active', 'paused', 'completed', 'cancelled'].includes(status)) {
          return json(400, { error: 'Invalid status' });
        }
        const updated = await updateRunningPlanInstance(config, instanceId, { status });
        return json(200, { instance: updated });
      }

      if (action === 'provision_workouts') {
        const template = await getRunningPlanTemplateById(config, instance.plan_template_id);
        if (!template) return json(404, { error: 'Template not found' });

        // Get VDOT from instance or body
        const currentVdot = body.currentVdot || instance.current_vdot;
        if (!currentVdot) {
          return json(400, { error: 'No VDOT set. Define VDOT for athlete first.' });
        }

        const paces = calculatePaces(currentVdot);

        // Load template sessions (the actual plan structure)
        const templateSessions = await listRunningPlanTemplateSessions(config, instance.plan_template_id);
        const volumeDistributionMode = ['automatic', 'manual'].includes(
          String(template.default_volume_distribution_mode || '').trim().toLowerCase()
        )
          ? String(template.default_volume_distribution_mode).trim().toLowerCase()
          : 'automatic';

        const snapshotProvisioning = (instance.plan_snapshot && instance.plan_snapshot.provisioning) || {};
        const provisioningConfig = {
          initial_weekly_volume_km: body.initialWeeklyVolumeKm ?? body.initial_weekly_volume_km ?? snapshotProvisioning.initial_weekly_volume_km,
          weekly_progression_pct: body.weeklyProgressionPct ?? body.weekly_progression_pct ?? snapshotProvisioning.weekly_progression_pct,
          periodization_type: body.periodizationType ?? body.periodization_type ?? snapshotProvisioning.periodization_type,
        };
        const weeklyVolumes = resolveWeeklyVolumes(template.total_weeks, provisioningConfig);

        let workouts = [];

        if (templateSessions.length > 0) {
          const stepsCache = new Map();
          const sessionsByWeek = new Map();
          for (const ts of templateSessions) {
            const key = Number(ts.week_number);
            if (!sessionsByWeek.has(key)) sessionsByWeek.set(key, []);
            sessionsByWeek.get(key).push(ts);
          }

          // Use template sessions as the source of truth and resolve volumes at instance time.
          for (const [weekNumber, weekSessions] of sessionsByWeek.entries()) {
            const weeklyVolumeKm = weeklyVolumes[Math.max(0, weekNumber - 1)] || weeklyVolumes[weeklyVolumes.length - 1] || 30;

            const declaredSessionPctTotal = weekSessions.reduce((acc, session) => {
              const pct = toFiniteNumber(session?.progression_rule?.weekly_volume_pct, 0);
              return pct > 0 ? acc + pct : acc;
            }, 0);

            if (volumeDistributionMode === 'automatic') {
              const missingPctSession = weekSessions.find((s) => toFiniteNumber(s?.progression_rule?.weekly_volume_pct, 0) <= 0);
              if (missingPctSession) {
                return json(400, {
                  error: `Sessão sem weekly_volume_pct na semana ${weekNumber} (session_key=${missingPctSession.session_key})`,
                  code: 'MISSING_WEEKLY_VOLUME_PCT',
                  week_number: weekNumber,
                  session_key: missingPctSession.session_key,
                });
              }
              if (Math.abs(declaredSessionPctTotal - 100) > 0.25) {
                return json(400, {
                  error: `Soma de weekly_volume_pct inválida na semana ${weekNumber}: ${declaredSessionPctTotal.toFixed(2)}% (esperado 100%)`,
                  code: 'INVALID_WEEKLY_VOLUME_PCT_SUM',
                  week_number: weekNumber,
                  declared_total_pct: Number(declaredSessionPctTotal.toFixed(2)),
                });
              }
            }

            for (const ts of weekSessions) {
              const fallbackRef = SESSION_TYPE_TO_VDOT_REF[ts.session_type] || 'easy';
              const declaredSessionPct = toFiniteNumber(ts?.progression_rule?.weekly_volume_pct, 0);
              const sessionVolumePct = volumeDistributionMode === 'automatic'
                ? declaredSessionPct
                : 100 / Math.max(1, weekSessions.length);
              const sessionVolumeKm = weeklyVolumeKm * (sessionVolumePct / 100);

              let steps = [];
              if (ts.workout_template_id) {
                if (!stepsCache.has(ts.workout_template_id)) {
                  const loadedSteps = await listRunningWorkoutTemplateSteps(config, ts.workout_template_id);
                  stepsCache.set(ts.workout_template_id, Array.isArray(loadedSteps) ? loadedSteps : []);
                }
                steps = stepsCache.get(ts.workout_template_id) || [];
              }

              const workoutModeRaw = String(
                steps[0] && steps[0].export_hint && steps[0].export_hint.volume_mode
                  ? steps[0].export_hint.volume_mode
                  : ''
              ).toLowerCase();
              const isManualWorkout = workoutModeRaw === 'manual';

              if (volumeDistributionMode === 'manual' && !isManualWorkout) {
                return json(400, {
                  error: `Sessão ${ts.session_key} está em modo automático de steps mas o plano está em modo manual`,
                  code: 'MISMATCH_VOLUME_DISTRIBUTION_MODE',
                  week_number: weekNumber,
                  session_key: ts.session_key,
                });
              }

              const declaredStepPctTotal = steps.reduce((acc, step) => {
                const pct = toFiniteNumber(step?.export_hint?.step_volume_pct, 0);
                return pct > 0 ? acc + pct : acc;
              }, 0);

              const resolvedSteps = steps.map((step, idx) => {
                const stepPctRaw = toFiniteNumber(step?.export_hint?.step_volume_pct, 0);
                const stepVolumePct = isManualWorkout
                  ? null
                  : (declaredStepPctTotal > 0
                    ? ((stepPctRaw > 0 ? stepPctRaw : 0) / declaredStepPctTotal) * 100
                    : 100 / Math.max(1, steps.length));
                const stepVolumeKm = isManualWorkout ? null : (sessionVolumeKm * (stepVolumePct / 100));

                const rawPrescription = step && typeof step.prescription_payload === 'object'
                  ? step.prescription_payload
                  : {};
                const usePaceTarget = step && step.target_type === 'pace';
                const paceTarget = usePaceTarget
                  ? buildResolvedPaceTarget(paces, rawPrescription, fallbackRef)
                  : null;

                const manualDistanceMeters = Number(step.distance_meters);
                const manualDurationSeconds = Number(step.duration_seconds);
                const computedDistanceMeters = isManualWorkout
                  ? (Number.isFinite(manualDistanceMeters) && manualDistanceMeters > 0 ? Math.round(manualDistanceMeters) : null)
                  : Math.max(0, Math.round(stepVolumeKm * 1000));
                let computedDurationSeconds = null;
                if (isManualWorkout) {
                  computedDurationSeconds = Number.isFinite(manualDurationSeconds) && manualDurationSeconds > 0
                    ? Math.round(manualDurationSeconds)
                    : null;
                } else if (paceTarget && stepVolumeKm > 0) {
                  computedDurationSeconds = Math.max(1, Math.round(stepVolumeKm * paceTarget.target_sec_per_km));
                }

                return {
                  step_order: Number(step.step_order) || (idx + 1),
                  step_type: step.step_type,
                  target_type: step.target_type || 'none',
                  step_volume_pct: stepVolumePct == null ? null : round1(stepVolumePct),
                  step_volume_km: stepVolumeKm == null ? null : round1(stepVolumeKm),
                  distance_meters: computedDistanceMeters,
                  duration_seconds: computedDurationSeconds,
                  repeat_count: step.repeat_count || null,
                  pace_target: paceTarget,
                  instruction_text: step.instruction_text || null,
                };
              });

              const firstPaceStep = resolvedSteps.find((step) => step && step.pace_target);
              const paceTarget = firstPaceStep
                ? firstPaceStep.pace_target
                : buildResolvedPaceTarget(paces, null, fallbackRef);

              workouts.push({
                running_plan_instance_id: instanceId,
                week_number: weekNumber,
                session_key: ts.session_key,
                session_type: ts.session_type,
                workout_template_id: ts.workout_template_id || null,
                vdot_used: currentVdot,
                threshold_pace_sec_per_km_used: paces.thresholdSecPerKm,
                resolved_targets: {
                  pace_target: paceTarget,
                  paces,
                  volume_mode: (resolvedSteps[0] && resolvedSteps[0].step_volume_pct == null) ? 'manual' : 'automatic',
                  session_volume_mode: volumeDistributionMode,
                  weekly_volume_km: round1(weeklyVolumeKm),
                  session_volume_pct: (resolvedSteps[0] && resolvedSteps[0].step_volume_pct == null) ? null : round1(sessionVolumePct),
                  session_volume_km: (resolvedSteps[0] && resolvedSteps[0].step_volume_pct == null) ? null : round1(sessionVolumeKm),
                  resolved_steps: resolvedSteps,
                  prescription: {
                    mode: 'vdot_reference',
                    ref: paceTarget.ref,
                    offset_sec_per_km: paceTarget.offset_sec_per_km,
                    range_sec: paceTarget.range_sec,
                  },
                },
                status: 'planned',
                recalculation_policy: 'future_only',
              });
            }
          }
        } else {
          // Fallback: generate generic sessions (3 per week)
          const sessionTypes = ['easy', 'long', 'tempo', 'interval'];
          let typeIndex = 0;
          for (let week = 1; week <= template.total_weeks; week++) {
            for (let sessionNum = 1; sessionNum <= 3; sessionNum++) {
              const sessionType = sessionTypes[typeIndex % sessionTypes.length];
              typeIndex++;
              workouts.push({
                running_plan_instance_id: instanceId,
                week_number: week,
                session_key: `W${week}S${sessionNum}`,
                session_type: sessionType,
                vdot_used: currentVdot,
                threshold_pace_sec_per_km_used: paces.thresholdSecPerKm,
                resolved_targets: {
                  pace_target: buildResolvedPaceTarget(paces, null, SESSION_TYPE_TO_VDOT_REF[sessionType]),
                  paces,
                  prescription: {
                    mode: 'vdot_reference',
                    ref: SESSION_TYPE_TO_VDOT_REF[sessionType] || 'easy',
                    offset_sec_per_km: 0,
                    range_sec: 0,
                  },
                },
                status: 'planned',
                recalculation_policy: 'future_only',
              });
            }
          }
        }

        const created = await insertRunningWorkoutInstances(config, workouts);

        // Update instance with VDOT if not set
        if (!instance.current_vdot) {
          await updateRunningPlanInstance(config, instanceId, {
            current_vdot: currentVdot,
            current_threshold_pace_sec_per_km: paces.thresholdSecPerKm,
            last_recalculated_at: new Date().toISOString(),
          });
        }

        return json(201, {
          provisioned: created.length,
          instance: { ...instance, workouts_provisioned: true },
        });
      }

      return json(400, { error: 'Unknown action' });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('Error in coach-running-instances:', err);
    const status = err.status || 500;
    return json(status, { error: err.message || 'Internal server error' });
  }
};
