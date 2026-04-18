/**
 * GET /coach-athlete-profile-unified?athleteId=<uuid>
 *
 * Returns a unified AthleteProfile view-model that aggregates
 * athletes, athlete_running_vdot_history, athlete_training_zone_profiles,
 * athlete_training_zones, athlete_exercise_1rm, program_assignments,
 * strength_instances and running_plan_instances into one payload.
 */
const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { verifyCoachOwnsAthlete } = require("./_lib/supabase");
const { composeAthleteProfile } = require("./_lib/view-models");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const roles = Array.isArray(auth.roles) ? auth.roles : [];
    const isAdmin = roles.includes("admin");
    const isCoach = roles.includes("coach");
    if (!isAdmin && !isCoach) {
      return json(403, { error: "Forbidden" });
    }

    const qs = event.queryStringParameters || {};
    const athleteId = (qs.athleteId || "").toString().trim();
    if (!athleteId) {
      return json(400, { error: "athleteId is required" });
    }

    if (!isAdmin) {
      const owns = await verifyCoachOwnsAthlete(config, auth.user.sub, athleteId);
      if (!owns) {
        return json(403, { error: "Forbidden" });
      }
    }

    const profile = await composeAthleteProfile(config, athleteId);
    if (!profile) {
      return json(404, { error: "Athlete not found" });
    }

    return json(200, { profile });
  } catch (err) {
    console.error("[coach-athlete-profile-unified]", err);
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal error" });
  }
};
