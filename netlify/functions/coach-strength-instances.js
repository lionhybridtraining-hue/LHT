/**
 * Endpoint: coach-strength-instances
 *
 * Coach-scoped management of strength plan instances for the coach's own athletes.
 *
 * Routes:
 *   GET  — list instances for coach's athletes (filters: athleteId, planId, status)
 *   PATCH ?instanceId=X — update instance (status, start_date, load_round, coach_locked_until)
 */

const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  listAthletesByCoach,
  listStrengthPlanInstances,
  getStrengthPlanInstanceById,
  updateStrengthPlanInstance,
  verifyCoachOwnsAthlete
} = require("./_lib/supabase");

const ALLOWED_STATUS = new Set(["active", "paused", "completed", "cancelled"]);

exports.handler = async (event) => {
  if (!["GET", "PATCH"].includes(event.httpMethod)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const roles = Array.isArray(auth.roles) ? auth.roles : [];
    const isAdmin = roles.includes("admin");
    const isCoach = roles.includes("coach");
    if (!isCoach && !isAdmin) return json(403, { error: "Forbidden" });

    const coachIdentityId = auth.user.sub;
    const query = event.queryStringParameters || {};

    if (event.httpMethod === "GET") {
      const athleteIdFilter = (query.athleteId || "").trim() || null;
      const planIdFilter = (query.planId || "").trim() || null;
      const statusFilter = (query.status || "").trim() || null;

      // Get all of coach's athletes
      const coachAthletes = await listAthletesByCoach(config, coachIdentityId);
      if (!Array.isArray(coachAthletes) || coachAthletes.length === 0) {
        return json(200, { instances: [], athletes: [] });
      }

      const athleteIds = new Set(coachAthletes.map((a) => a.id));

      // If filtering by specific athlete, verify coach owns them
      if (athleteIdFilter && !athleteIds.has(athleteIdFilter)) {
        return json(403, { error: "Athlete not assigned to you" });
      }

      // Fetch instances, scoped to coach's athletes
      const filters = {};
      if (athleteIdFilter) filters.athleteId = athleteIdFilter;
      if (planIdFilter) filters.planId = planIdFilter;
      if (statusFilter) filters.status = statusFilter;

      const allInstances = await listStrengthPlanInstances(config, filters);
      const instances = Array.isArray(allInstances)
        ? allInstances.filter((inst) => athleteIds.has(inst.athlete_id))
        : [];

      return json(200, {
        instances: instances.map(mapInstance),
        athletes: coachAthletes.map((a) => ({ id: a.id, name: a.name, email: a.email }))
      });
    }

    // PATCH handler
    const instanceId = (query.instanceId || "").trim();
    if (!instanceId) {
      return json(400, { error: "instanceId query parameter is required" });
    }

    const existing = await getStrengthPlanInstanceById(config, instanceId);
    if (!existing) return json(404, { error: "Instance not found" });

    // Verify coach owns this athlete
    const owns = await verifyCoachOwnsAthlete(config, coachIdentityId, existing.athlete_id);
    if (!owns) {
      return json(403, { error: "Athlete not assigned to you" });
    }

    const body = parseJsonBody(event);
    const patch = {};

    if (body.status !== undefined) {
      const nextStatus = (body.status || "").trim();
      if (!ALLOWED_STATUS.has(nextStatus)) {
        return json(400, { error: "Invalid status value" });
      }
      patch.status = nextStatus;
    }

    if (body.start_date !== undefined) {
      patch.start_date = body.start_date ? body.start_date.toString().trim() : null;
    }

    if (body.load_round !== undefined) {
      const loadRound = Number(body.load_round);
      if (!Number.isFinite(loadRound) || loadRound <= 0) {
        return json(400, { error: "load_round must be a positive number" });
      }
      patch.load_round = loadRound;
    }

    if (body.coach_locked_until !== undefined) {
      patch.coach_locked_until = body.coach_locked_until ? body.coach_locked_until.toString().trim() : null;
    }

    if (!Object.keys(patch).length) {
      return json(400, { error: "No valid fields to update" });
    }

    const updated = await updateStrengthPlanInstance(config, instanceId, patch);
    return json(200, {
      instance: mapInstance(updated),
      previousStatus: existing.status
    });
  } catch (err) {
    return json(err.status || 500, { error: err.message || "Internal server error" });
  }
};

function mapInstance(instance) {
  if (!instance) return null;
  return {
    id: instance.id,
    athlete_id: instance.athlete_id,
    plan_id: instance.plan_id,
    status: instance.status,
    start_date: instance.start_date || null,
    load_round: instance.load_round || null,
    access_model: instance.access_model || null,
    stripe_purchase_id: instance.stripe_purchase_id || null,
    program_assignment_id: instance.program_assignment_id || null,
    coach_locked_until: instance.coach_locked_until || null,
    assigned_by: instance.assigned_by || null,
    created_at: instance.created_at || null,
    updated_at: instance.updated_at || null,
    plan_name: instance.plan?.name || null,
    plan_training_program_id: instance.plan?.training_program_id || null
  };
}
