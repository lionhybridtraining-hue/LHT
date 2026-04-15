/**
 * coach-running-vdot.js
 * Coach endpoint for managing athlete VDOT
 *
 * Routes:
 * GET  /coach-running-vdot?athlete_id=<id> — Get current VDOT and history
 * POST /coach-running-vdot — Set athlete VDOT from race result or direct value
 */

const { json, parseJsonBody } = require('./_lib/http');
const { getConfig } = require('./_lib/config');
const { requireAuthenticatedUser } = require('./_lib/authz');
const {
  setCurrentRunningVdot,
  getCurrentRunningVdot,
  listRunningVdotHistory,
  updateRunningPlanInstance,
  updateFutureRunningWorkoutsByVdot,
  getActiveRunningPlanInstance,
  verifyCoachOwnsAthlete,
} = require('./_lib/supabase');
const { calculateVDOT, calculatePaces } = require('./_lib/running-engine');

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
    // ── GET ── Current VDOT + history
    if (event.httpMethod === 'GET') {
      const qs = event.queryStringParameters || {};
      if (!qs.athlete_id) return json(400, { error: 'athlete_id is required' });

      if (!isAdmin) {
        const owns = await verifyCoachOwnsAthlete(config, coachId, qs.athlete_id);
        if (!owns) return json(403, { error: 'Forbidden' });
      }

      const current = await getCurrentRunningVdot(config, qs.athlete_id);
      const history = await listRunningVdotHistory(config, qs.athlete_id, 10);

      return json(200, { current, history });
    }

    // ── POST ── Set VDOT
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }
    const body = parseJsonBody(event);

    const { athlete_id, source_type, race_distance_km, race_duration_sec, direct_vdot, training_session_id } = body;

    if (!athlete_id || !source_type) {
      return json(400, { error: 'athlete_id and source_type are required' });
    }

    if (!['race_result', 'coach_set', 'time_trial'].includes(source_type)) {
      return json(400, { error: 'source_type must be race_result, coach_set, or time_trial' });
    }

    // Verify coach owns this athlete
    if (!isAdmin) {
      const owns = await verifyCoachOwnsAthlete(config, coachId, athlete_id);
      if (!owns) return json(403, { error: 'Forbidden' });
    }

    let vdot;
    let thresholdPace;

    if (source_type === 'race_result' || source_type === 'time_trial') {
      if (!race_distance_km || !race_duration_sec) {
        return json(400, { error: 'race_distance_km and race_duration_sec are required for race_result or time_trial' });
      }
      vdot = calculateVDOT(race_distance_km, race_duration_sec);
      thresholdPace = calculatePaces(vdot).thresholdSecPerKm;
    } else {
      if (!direct_vdot) {
        return json(400, { error: 'direct_vdot is required for coach_set' });
      }
      vdot = parseFloat(direct_vdot);
      if (vdot < 20 || vdot > 85) {
        return json(400, { error: 'VDOT must be between 20 and 85' });
      }
      thresholdPace = calculatePaces(vdot).thresholdSecPerKm;
    }

    // Record VDOT in history
    const vdotRecord = await setCurrentRunningVdot(config, athlete_id, {
      athlete_id,
      training_session_id: training_session_id || null,
      source_type,
      source_label: source_type === 'race_result' ? `${race_distance_km}km race` : null,
      race_distance_km: (source_type === 'race_result' || source_type === 'time_trial') ? race_distance_km : null,
      effort_duration_seconds: (source_type === 'race_result' || source_type === 'time_trial') ? race_duration_sec : null,
      vdot,
      threshold_pace_sec_per_km: thresholdPace,
      confidence: source_type === 'coach_set' ? 0.95 : 0.85,
      measured_at: new Date().toISOString(),
    });

    if (!vdotRecord) {
      return json(500, { error: 'Failed to save VDOT' });
    }

    // Update active running plan instance with new VDOT
    const instance = await getActiveRunningPlanInstance(config, athlete_id);
    if (instance) {
      await updateRunningPlanInstance(config, instance.id, {
        current_vdot: vdot,
        current_threshold_pace_sec_per_km: thresholdPace,
        last_recalculated_at: new Date().toISOString(),
      });

      // Recalculate future workouts with new paces
      const paces = calculatePaces(vdot);
      const updated = await updateFutureRunningWorkoutsByVdot(config, instance.id, {
        vdot,
        thresholdSecPerKm: thresholdPace,
        ...paces,
      });

      return json(200, {
        vdot: vdotRecord,
        instance,
        workouts_recalculated: updated,
        message: `VDOT set to ${vdot}. ${updated} future workouts recalculated.`,
      });
    }

    return json(200, {
      vdot: vdotRecord,
      message: 'VDOT recorded. No active running plan to update.',
    });
  } catch (err) {
    console.error('Error in coach-running-vdot:', err);
    const status = err.status || 500;
    return json(status, { error: err.message || 'Internal server error' });
  }
};
