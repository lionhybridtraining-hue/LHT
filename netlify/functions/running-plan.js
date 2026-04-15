/**
 * running-plan.js
 * Coach endpoint for managing running plan templates and assigning to athletes
 *
 * Routes:
 * GET /running-plan â€” List running plan templates (coach view)
 * GET /running-plan?id=<id> â€” Get single template
 * POST /running-plan â€” Create new running plan template
 * POST /running-plan (action=assign) â€” Assign template to athlete
 * PUT /running-plan â€” Update running plan template
 */

const { json, parseJsonBody } = require('./_lib/http');
const { getConfig } = require('./_lib/config');
const { requireAuthenticatedUser } = require('./_lib/authz');
const {
  listRunningPlanTemplates,
  getRunningPlanTemplateById,
  createRunningPlanTemplate,
  updateRunningPlanTemplate,
  createRunningPlanInstance,
  listRunningPlanTemplateSessions,
  upsertRunningPlanTemplateSessions,
  deleteRunningPlanTemplateSessionsByIds,
  verifyCoachOwnsAthlete,
  getAthleteById,
} = require('./_lib/supabase');
const {
  ENGINE_VERSION,
} = require('./_lib/running-engine');
const { reportOperationalError } = require('./_lib/ops-notifications');

exports.handler = async (event) => {
  const config = getConfig();

  try {
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const roles = Array.isArray(auth.roles) ? auth.roles : [];
    const isCoach = roles.includes('coach');
    const isAdmin = roles.includes('admin');
    if (!isCoach && !isAdmin) {
      return json(403, { error: 'Forbidden' });
    }

    const coachId = auth.user.sub;
    const qs = event.queryStringParameters || {};

    // â”€â”€ GET â”€â”€
    if (event.httpMethod === 'GET') {
      if (qs.id) {
        const template = await getRunningPlanTemplateById(config, qs.id);
        if (!template) return json(404, { error: 'Template not found' });
        const sessions = await listRunningPlanTemplateSessions(config, qs.id);
        return json(200, { template, sessions });
      }

      const filters = {};
      if (qs.status) filters.status = qs.status;
      if (qs.trainingProgramId) filters.trainingProgramId = qs.trainingProgramId;
      const templates = await listRunningPlanTemplates(config, filters);
      return json(200, { templates, count: templates.length });
    }

    // â”€â”€ POST â”€â”€
    if (event.httpMethod === 'POST') {
      const body = parseJsonBody(event);

      // POST with action=assign â†’ create instance
      if (body.action === 'assign') {
        if (!body.plan_template_id || !body.athlete_id || !body.start_date) {
          return json(400, { error: 'plan_template_id, athlete_id, and start_date are required' });
        }

        const missingAssignFields = [];
        if (body.initial_weekly_volume_km == null || body.initial_weekly_volume_km === '') {
          missingAssignFields.push('initial_weekly_volume_km');
        }
        if (body.weekly_progression_pct == null || body.weekly_progression_pct === '') {
          missingAssignFields.push('weekly_progression_pct');
        }
        if (body.periodization_type == null || body.periodization_type === '') {
          missingAssignFields.push('periodization_type');
        }
        if (missingAssignFields.length > 0) {
          return json(400, {
            error: `Campos obrigatórios ausentes: ${missingAssignFields.join(', ')}`,
            code: 'MISSING_RUNNING_VOLUME_CONFIG',
            missing_fields: missingAssignFields,
          });
        }

        const initialWeeklyVolumeKmRaw = parseFloat(body.initial_weekly_volume_km);
        const weeklyProgressionPctRaw = parseFloat(body.weekly_progression_pct);
        const initialWeeklyVolumeKm = initialWeeklyVolumeKmRaw;
        const weeklyProgressionPct = weeklyProgressionPctRaw;
        const periodizationType = String(body.periodization_type || '').trim().toLowerCase();

        if (!Number.isFinite(initialWeeklyVolumeKm) || initialWeeklyVolumeKm < 5 || initialWeeklyVolumeKm > 300) {
          return json(400, {
            error: 'initial_weekly_volume_km must be between 5 and 300',
            code: 'INVALID_RUNNING_VOLUME_CONFIG',
            field: 'initial_weekly_volume_km',
            min: 5,
            max: 300,
          });
        }
        if (!Number.isFinite(weeklyProgressionPct) || weeklyProgressionPct < -5 || weeklyProgressionPct > 20) {
          return json(400, {
            error: 'weekly_progression_pct must be between -5 and 20',
            code: 'INVALID_RUNNING_VOLUME_CONFIG',
            field: 'weekly_progression_pct',
            min: -5,
            max: 20,
          });
        }
        if (!['linear', 'undulating', 'block'].includes(periodizationType)) {
          return json(400, {
            error: 'periodization_type must be linear, undulating, or block',
            code: 'INVALID_RUNNING_VOLUME_CONFIG',
            field: 'periodization_type',
            allowed: ['linear', 'undulating', 'block'],
          });
        }

        if (!isAdmin) {
          const owns = await verifyCoachOwnsAthlete(config, coachId, body.athlete_id);
          if (!owns) return json(403, { error: 'Forbidden' });
        }

        const template = await getRunningPlanTemplateById(config, body.plan_template_id);
        if (!template) return json(404, { error: 'Template not found' });

        const athlete = await getAthleteById(config, body.athlete_id);
        if (!athlete) return json(404, { error: 'Athlete not found' });

        const instance = await createRunningPlanInstance(config, {
          plan_template_id: body.plan_template_id,
          athlete_id: body.athlete_id,
          program_assignment_id: body.program_assignment_id || null,
          stripe_purchase_id: body.stripe_purchase_id || null,
          start_date: body.start_date,
          status: 'active',
          engine_version: ENGINE_VERSION,
          plan_snapshot: {
            template_id: body.plan_template_id,
            template_name: template.name,
            total_weeks: template.total_weeks,
            provisioning: {
              initial_weekly_volume_km: Number(initialWeeklyVolumeKm.toFixed(1)),
              weekly_progression_pct: Number(weeklyProgressionPct.toFixed(2)),
              periodization_type: periodizationType,
            },
            assigned_at: new Date().toISOString(),
          },
        });

        return json(201, { instance });
      }

      // Plan auto-generation was intentionally removed.
      if (body.action === 'generate') {
        return json(410, { error: 'Ferramenta de gerar plano removida. Cria planos e treinos manualmente.' });
      }

      // POST default: create new plan template
      if (!body.name || !body.total_weeks || !body.training_program_id) {
        return json(400, { error: 'name, total_weeks, and training_program_id are required' });
      }

      if (body.total_weeks < 4 || body.total_weeks > 52) {
        return json(400, { error: 'total_weeks must be between 4 and 52' });
      }

      const createPayload = {
        training_program_id: body.training_program_id,
        name: body.name,
        objective: body.objective || null,
        total_weeks: body.total_weeks,
        default_metric_model: body.default_metric_model || 'vdot',
        default_vdot_source: body.default_vdot_source || 'coach_set',
        status: 'draft',
        engine_version: ENGINE_VERSION,
        created_by: coachId,
      };

      if (body.default_volume_distribution_mode != null && body.default_volume_distribution_mode !== '') {
        const defaultVolumeDistributionMode = String(body.default_volume_distribution_mode).trim().toLowerCase();
        if (!['automatic', 'manual'].includes(defaultVolumeDistributionMode)) {
          return json(400, {
            error: 'default_volume_distribution_mode must be automatic or manual',
            code: 'INVALID_TEMPLATE_VOLUME_DEFAULTS',
            field: 'default_volume_distribution_mode',
            allowed: ['automatic', 'manual'],
          });
        }
        createPayload.default_volume_distribution_mode = defaultVolumeDistributionMode;
      }

      if (body.default_initial_weekly_volume_km != null && body.default_initial_weekly_volume_km !== '') {
        const defaultInitialWeeklyVolumeKm = parseFloat(body.default_initial_weekly_volume_km);
        if (!Number.isFinite(defaultInitialWeeklyVolumeKm) || defaultInitialWeeklyVolumeKm < 5 || defaultInitialWeeklyVolumeKm > 300) {
          return json(400, {
            error: 'default_initial_weekly_volume_km must be between 5 and 300',
            code: 'INVALID_TEMPLATE_VOLUME_DEFAULTS',
            field: 'default_initial_weekly_volume_km',
            min: 5,
            max: 300,
          });
        }
        createPayload.default_initial_weekly_volume_km = defaultInitialWeeklyVolumeKm;
      }

      if (body.default_weekly_progression_pct != null && body.default_weekly_progression_pct !== '') {
        const defaultWeeklyProgressionPct = parseFloat(body.default_weekly_progression_pct);
        if (!Number.isFinite(defaultWeeklyProgressionPct) || defaultWeeklyProgressionPct < -5 || defaultWeeklyProgressionPct > 20) {
          return json(400, {
            error: 'default_weekly_progression_pct must be between -5 and 20',
            code: 'INVALID_TEMPLATE_VOLUME_DEFAULTS',
            field: 'default_weekly_progression_pct',
            min: -5,
            max: 20,
          });
        }
        createPayload.default_weekly_progression_pct = defaultWeeklyProgressionPct;
      }

      if (body.default_periodization_type != null && body.default_periodization_type !== '') {
        const defaultPeriodizationType = String(body.default_periodization_type).trim().toLowerCase();
        if (!['linear', 'undulating', 'block'].includes(defaultPeriodizationType)) {
          return json(400, {
            error: 'default_periodization_type must be linear, undulating, or block',
            code: 'INVALID_TEMPLATE_VOLUME_DEFAULTS',
            field: 'default_periodization_type',
            allowed: ['linear', 'undulating', 'block'],
          });
        }
        createPayload.default_periodization_type = defaultPeriodizationType;
      }

      const template = await createRunningPlanTemplate(config, createPayload);

      return json(201, { template });
    }

    // â”€â”€ PUT â”€â”€
    if (event.httpMethod === 'PUT') {
      const body = parseJsonBody(event);

      // Action: save plan template sessions (week Ã— session grid)
      if (body.action === 'save_sessions') {
        if (!body.plan_template_id) {
          return json(400, { error: 'plan_template_id is required' });
        }
        const existing = await getRunningPlanTemplateById(config, body.plan_template_id);
        if (!existing) return json(404, { error: 'Template not found' });

        const sessions = Array.isArray(body.sessions) ? body.sessions : [];
        const compositeKey = (weekNumber, sessionKey) => `${Number(weekNumber)}::${String(sessionKey || '').trim()}`;

        // Validate duplicate keys inside the same request payload.
        const seenPayloadKeys = new Set();
        for (const s of sessions) {
          const key = compositeKey(s.week_number, s.session_key);
          if (seenPayloadKeys.has(key)) {
            return json(400, { error: `Duplicate session key in payload: week ${s.week_number}, key ${s.session_key}` });
          }
          seenPayloadKeys.add(key);
        }

        // Prevent accidental overwrite for create operations (rows without id).
        const existingSessions = await listRunningPlanTemplateSessions(config, body.plan_template_id);
        const deleteIds = new Set(Array.isArray(body.delete_ids) ? body.delete_ids : []);
        const existingByKey = new Map();
        for (const row of existingSessions) {
          if (deleteIds.has(row.id)) continue;
          existingByKey.set(compositeKey(row.week_number, row.session_key), row);
        }

        for (const s of sessions) {
          if (s.id) continue; // edits are allowed
          const key = compositeKey(s.week_number, s.session_key);
          if (existingByKey.has(key)) {
            return json(409, {
              error: `Session key already exists for this week: ${s.session_key}. Use a different key (e.g. S2, S3).`,
              week_number: s.week_number,
              session_key: s.session_key,
            });
          }
        }

        const toUpsert = sessions.map((s, index) => {
          const mapped = {
            id: s.id || undefined,
            plan_template_id: body.plan_template_id,
            week_number: s.week_number,
            session_key: s.session_key,
            session_label: s.session_label || null,
            workout_template_id: s.workout_template_id,
            session_type: s.session_type,
            progression_rule: s.progression_rule || {},
            notes: s.notes || null,
          };

          const parsedOrder = Number(s.session_order);
          if (Number.isInteger(parsedOrder) && parsedOrder > 0) {
            mapped.session_order = parsedOrder;
          } else if (!s.id) {
            mapped.session_order = index + 1;
          }

          return mapped;
        });

        // If delete_ids provided, remove those first
        if (Array.isArray(body.delete_ids) && body.delete_ids.length > 0) {
          await deleteRunningPlanTemplateSessionsByIds(config, body.delete_ids);
        }

        const saved = toUpsert.length > 0
          ? await upsertRunningPlanTemplateSessions(config, toUpsert)
          : [];
        return json(200, { sessions: saved });
      }

      if (!body.id) return json(400, { error: 'id is required' });

      const patch = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.objective !== undefined) patch.objective = body.objective;
      if (body.status !== undefined) patch.status = body.status;
      if (body.total_weeks !== undefined) patch.total_weeks = body.total_weeks;
      if (body.training_program_id !== undefined) {
        if (!body.training_program_id) {
          return json(400, { error: 'training_program_id cannot be empty' });
        }
        patch.training_program_id = body.training_program_id;
      }
      if (body.default_volume_distribution_mode !== undefined) {
        const mode = String(body.default_volume_distribution_mode || '').trim().toLowerCase();
        if (!['automatic', 'manual'].includes(mode)) {
          return json(400, {
            error: 'default_volume_distribution_mode must be automatic or manual',
            code: 'INVALID_TEMPLATE_VOLUME_DEFAULTS',
            field: 'default_volume_distribution_mode',
            allowed: ['automatic', 'manual'],
          });
        }
        patch.default_volume_distribution_mode = mode;
      }

      const updated = await updateRunningPlanTemplate(config, body.id, patch);
      if (!updated) return json(404, { error: 'Template not found' });
      return json(200, { template: updated });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('Error in running-plan:', err);
    const status = err.status || 500;
    if (status >= 500) {
      await reportOperationalError(config, {
        source: 'running-plan',
        title: 'Falha no endpoint running-plan',
        error: err,
        status,
        metadata: {
          method: event && event.httpMethod ? event.httpMethod : null,
          path: event && event.path ? event.path : null
        }
      });
    }
    return json(status, { error: err.message || 'Internal server error' });
  }
};

