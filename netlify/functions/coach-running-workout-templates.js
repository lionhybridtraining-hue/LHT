/**
 * coach-running-workout-templates.js
 * Coach endpoint for managing running workout templates and their steps
 *
 * Routes:
 * GET  ?id=<id>                  — Get single workout template with steps
 * GET  (no id)                   — List workout templates (optionally filtered)
 * POST                           — Create new workout template
 * PUT                            — Update workout template metadata
 * PUT  (action=save_steps)       — Replace all steps for a workout template
 * DELETE ?id=<id>                — Delete workout template (if not referenced)
 */

const { json, parseJsonBody } = require('./_lib/http');
const { getConfig } = require('./_lib/config');
const { requireAuthenticatedUser } = require('./_lib/authz');
const {
  listRunningWorkoutTemplates,
  getRunningWorkoutTemplateById,
  createRunningWorkoutTemplate,
  updateRunningWorkoutTemplate,
  listRunningWorkoutTemplateSteps,
  upsertRunningWorkoutTemplateSteps,
  deleteRunningWorkoutTemplateSteps,
} = require('./_lib/supabase');

const VALID_SESSION_TYPES = new Set([
  'easy', 'threshold', 'interval', 'long', 'tempo',
  'repetition', 'recovery', 'test', 'mobility', 'other'
]);
const VALID_STEP_TYPES = new Set([
  'warmup', 'steady', 'interval', 'recovery', 'cooldown', 'repeat', 'note'
]);
const VALID_TARGET_TYPES = new Set([
  'none', 'pace', 'heart_rate', 'rpe', 'power', 'cadence'
]);
const VALID_TARGET_METRICS = new Set([
  'pace', 'heart_rate', 'rpe', 'power', 'none'
]);
const VALID_VDOT_REFS = new Set([
  'recovery', 'easy', 'marathon', 'threshold', 'interval', 'repetition'
]);

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

  const coachIdentityId = auth.user.sub;

  try {
    const qs = event.queryStringParameters || {};

    // ── GET ──
    if (event.httpMethod === 'GET') {
      if (qs.id) {
        const template = await getRunningWorkoutTemplateById(config, qs.id);
        if (!template) return json(404, { error: 'Workout template not found' });
        const steps = await listRunningWorkoutTemplateSteps(config, qs.id);
        return json(200, { template, steps });
      }

      const filters = {};
      if (qs.session_type) filters.sessionType = qs.session_type;
      if (qs.is_library !== undefined) filters.isLibrary = qs.is_library === 'true';
      const templates = await listRunningWorkoutTemplates(config, filters);
      return json(200, { templates, count: templates.length });
    }

    // ── POST ──
    if (event.httpMethod === 'POST') {
      const body = parseJsonBody(event);

      if (!body.name) return json(400, { error: 'name is required' });
      if (!body.session_type || !VALID_SESSION_TYPES.has(body.session_type)) {
        return json(400, { error: 'Invalid or missing session_type' });
      }
      if (body.target_metric && !VALID_TARGET_METRICS.has(body.target_metric)) {
        return json(400, { error: 'Invalid target_metric' });
      }

      const template = await createRunningWorkoutTemplate(config, {
        coach_id: body.coach_id || null,
        name: body.name,
        session_type: body.session_type,
        objective: body.objective || null,
        target_metric: body.target_metric || 'pace',
        is_library: body.is_library !== false,
      });

      return json(201, { template });
    }

    // ── PUT ──
    if (event.httpMethod === 'PUT') {
      const body = parseJsonBody(event);

      // Action: replace steps for a workout template
      if (body.action === 'save_steps') {
        if (!body.workout_template_id) {
          return json(400, { error: 'workout_template_id is required' });
        }
        const existing = await getRunningWorkoutTemplateById(config, body.workout_template_id);
        if (!existing) return json(404, { error: 'Workout template not found' });

        const steps = Array.isArray(body.steps) ? body.steps : [];
        const validated = [];
        let totalStepVolumePct = 0;
        let volumeMode = String(body.volume_mode || '').trim().toLowerCase();
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          if (!s.step_type || !VALID_STEP_TYPES.has(s.step_type)) {
            return json(400, { error: `Step ${i}: invalid step_type "${s.step_type}"` });
          }
          if (s.target_type && !VALID_TARGET_TYPES.has(s.target_type)) {
            return json(400, { error: `Step ${i}: invalid target_type "${s.target_type}"` });
          }
          const targetType = s.target_type || 'none';
          const rawPayload = s.prescription_payload && typeof s.prescription_payload === 'object'
            ? s.prescription_payload
            : {};

          // Phase 1 scope: pace prescription is VDOT-only.
          if (targetType === 'pace') {
            if (rawPayload.mode !== 'vdot_reference') {
              return json(400, { error: `Step ${i}: pace target requires prescription_payload.mode='vdot_reference'` });
            }
            if (!VALID_VDOT_REFS.has(rawPayload.ref)) {
              return json(400, { error: `Step ${i}: invalid prescription_payload.ref` });
            }
          }

          const prescriptionPayload = targetType === 'pace'
            ? {
                mode: 'vdot_reference',
                ref: rawPayload.ref,
                offset_sec_per_km: rawPayload.offset_sec_per_km != null ? Number(rawPayload.offset_sec_per_km) : 0,
                range_sec: rawPayload.range_sec != null ? Number(rawPayload.range_sec) : 0,
              }
            : {};

          const rawExportHint = s.export_hint && typeof s.export_hint === 'object'
            ? s.export_hint
            : {};
          const stepVolumePct = Number(rawExportHint.step_volume_pct);
          const stepMode = String(rawExportHint.volume_mode || '').trim().toLowerCase();
          if (!volumeMode && (stepMode === 'manual' || stepMode === 'automatic')) {
            volumeMode = stepMode;
          }
          if (volumeMode !== 'manual') {
            if (!Number.isFinite(stepVolumePct) || stepVolumePct <= 0) {
              return json(400, { error: `Step ${i}: export_hint.step_volume_pct must be a number > 0` });
            }
            totalStepVolumePct += stepVolumePct;
          } else {
            const hasDuration = Number(s.duration_seconds) > 0;
            const hasDistance = Number(s.distance_meters) > 0;
            if (!hasDuration && !hasDistance) {
              return json(400, { error: `Step ${i}: manual mode requires duration_seconds or distance_meters` });
            }
          }

          validated.push({
            id: s.id || undefined,
            workout_template_id: body.workout_template_id,
            step_order: i + 1,
            step_type: s.step_type,
            target_type: targetType,
            duration_seconds: s.duration_seconds || null,
            distance_meters: s.distance_meters || null,
            repeat_count: s.repeat_count || null,
            target_min: s.target_min != null ? Number(s.target_min) : null,
            target_max: s.target_max != null ? Number(s.target_max) : null,
            target_unit: s.target_unit || null,
            prescription_payload: prescriptionPayload,
            instruction_text: s.instruction_text || null,
            export_hint: {
              ...rawExportHint,
              step_volume_pct: volumeMode === 'manual' ? null : Number(stepVolumePct.toFixed(2)),
              volume_mode: volumeMode === 'manual' ? 'manual' : 'automatic',
            },
          });
        }

        if (volumeMode !== 'manual' && steps.length > 0 && Math.abs(totalStepVolumePct - 100) > 0.25) {
          return json(400, { error: `Step volume percentages must sum to 100%. Current total: ${totalStepVolumePct.toFixed(2)}%` });
        }

        // Delete-then-upsert for clean replace
        await deleteRunningWorkoutTemplateSteps(config, body.workout_template_id);
        const saved = validated.length > 0
          ? await upsertRunningWorkoutTemplateSteps(config, validated)
          : [];
        return json(200, { steps: saved });
      }

      // Default PUT: update template metadata
      if (!body.id) return json(400, { error: 'id is required' });

      const patch = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.objective !== undefined) patch.objective = body.objective;
      if (body.session_type !== undefined) {
        if (!VALID_SESSION_TYPES.has(body.session_type)) {
          return json(400, { error: 'Invalid session_type' });
        }
        patch.session_type = body.session_type;
      }
      if (body.target_metric !== undefined) {
        if (!VALID_TARGET_METRICS.has(body.target_metric)) {
          return json(400, { error: 'Invalid target_metric' });
        }
        patch.target_metric = body.target_metric;
      }
      if (body.is_library !== undefined) patch.is_library = body.is_library;

      const updated = await updateRunningWorkoutTemplate(config, body.id, patch);
      if (!updated) return json(404, { error: 'Workout template not found' });
      return json(200, { template: updated });
    }

    // ── DELETE ──
    if (event.httpMethod === 'DELETE') {
      if (!qs.id) return json(400, { error: 'id is required' });

      const existing = await getRunningWorkoutTemplateById(config, qs.id);
      if (!existing) return json(404, { error: 'Workout template not found' });

      // Delete steps first, then template
      // Note: If template is referenced by plan_template_sessions (ON DELETE RESTRICT),
      // the DB will reject deletion, which is the correct behavior
      await deleteRunningWorkoutTemplateSteps(config, qs.id);
      return json(200, { deleted: true, id: qs.id });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('Error in coach-running-workout-templates:', err);
    const status = err.status || 500;
    return json(status, { error: err.message || 'Internal server error' });
  }
};
