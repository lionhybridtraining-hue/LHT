/**
 * athlete-running-plan.js
 * Athlete endpoint for viewing their active running plan
 *
 * Routes:
 * GET /athlete-running-plan — Get active running plan with workouts and VDOT
 * GET /athlete-running-plan?week=N — Get workouts for specific week
 */

const { json } = require('./_lib/http');
const { getConfig } = require('./_lib/config');
const { requireAuthenticatedUser } = require('./_lib/authz');
const {
  getActiveRunningPlanInstance,
  getRunningPlanTemplateById,
  listRunningWorkoutInstances,
  getCurrentRunningVdot,
  listRunningWorkoutInstancesWithSessions,
  getAthleteByIdentity,
} = require('./_lib/supabase');
const { computeZonesFromVdot, secPerKmToMinSecFormat } = require('./_lib/running-engine');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method must be GET' });
  }

  const config = getConfig();
  const auth = await requireAuthenticatedUser(event, config);
  if (auth.error) return auth.error;

  try {
    // Resolve athlete from identity
    const athlete = await getAthleteByIdentity(config, auth.user.sub);
    if (!athlete) {
      return json(200, { instance: null, message: 'No athlete profile found' });
    }

    const instance = await getActiveRunningPlanInstance(config, athlete.id);
    if (!instance) {
      return json(200, { instance: null, message: 'No active running plan' });
    }

    const template = await getRunningPlanTemplateById(config, instance.plan_template_id);

    // Get current VDOT and compute zones
    const vdotRecord = await getCurrentRunningVdot(config, athlete.id);
    let zones = null;
    if (vdotRecord) {
      zones = computeZonesFromVdot(vdotRecord.vdot);
    }

    // Get workouts, optionally filtered by week
    const qs = event.queryStringParameters || {};
    let workouts;
    if (qs.week) {
      workouts = (await listRunningWorkoutInstances(config, instance.id, {
        weekNumber: parseInt(qs.week, 10),
      })).map(enrichWorkout);
    } else {
      workouts = (await listRunningWorkoutInstancesWithSessions(config, instance.id)).map(
        enrichWorkout
      );
    }

    // Group by week
    const workoutsByWeek = {};
    for (const w of workouts) {
      if (!workoutsByWeek[w.week_number]) workoutsByWeek[w.week_number] = [];
      workoutsByWeek[w.week_number].push(w);
    }

    return json(200, {
      instance: { ...instance, template },
      vdot: vdotRecord,
      zones,
      workouts: qs.week ? workouts : workoutsByWeek,
      summary: {
        totalWeeks: template.total_weeks,
        currentWeek: computeCurrentWeek(instance.start_date),
        status: instance.status,
        workoutCount: workouts.length,
      },
    });
  } catch (err) {
    console.error('Error in athlete-running-plan:', err);
    const status = err.status || 500;
    return json(status, { error: err.message || 'Internal server error' });
  }
};

function enrichWorkout(workout) {
  // Add human-readable pace formatters
  const enriched = { ...workout };

  if (workout.resolved_targets) {
    const targets = workout.resolved_targets;
    if (targets.thresholdSecPerKm) {
      enriched.thresholdPaceFormatted = secPerKmToMinSecFormat(targets.thresholdSecPerKm);
    }
    if (targets.intervalSecPerKm) {
      enriched.intervalPaceFormatted = secPerKmToMinSecFormat(targets.intervalSecPerKm);
    }
    if (targets.marathonSecPerKm) {
      enriched.marathonPaceFormatted = secPerKmToMinSecFormat(targets.marathonSecPerKm);
    }
    if (targets.easyFastSecPerKm) {
      enriched.easyFastPaceFormatted = secPerKmToMinSecFormat(targets.easyFastSecPerKm);
    }
    if (targets.easySlowSecPerKm) {
      enriched.easySlowPaceFormatted = secPerKmToMinSecFormat(targets.easySlowSecPerKm);
    }
  }

  return enriched;
}

function computeCurrentWeek(startDateStr) {
  const startDate = new Date(startDateStr);
  const today = new Date();
  const daysDiff = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
  const currentWeek = Math.floor(daysDiff / 7) + 1;
  return Math.max(1, currentWeek);
}
