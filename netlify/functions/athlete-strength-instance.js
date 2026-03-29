/**
 * Endpoint: athlete-strength-instance
 *
 * Allows athletes to self-manage their own strength plan instances.
 * Access to a training program can be granted either by:
 *   - active Stripe purchase, or
 *   - active-like manual program assignment.
 *
 * Routes:
 *   GET  — list all strength plan instances for the authenticated athlete
 *   POST — create a new instance for an associated training program
 *   PATCH ?instanceId=X — update instance status (cancel/pause/resume)
 */

const { requireAuthenticatedUser } = require("./_lib/authz");
const { getConfig } = require("./_lib/config");
const { parseJsonBody, json } = require("./_lib/http");
const { getProgramAssociationAccess } = require("./_lib/program-access");
const {
  getAthleteByIdentity,
  listStrengthPlanInstances,
  listStrengthPlans,
  createStrengthPlanInstance,
  updateStrengthPlanInstance,
  getStrengthPlanInstanceById,
  getTrainingProgramById
} = require("./_lib/supabase");

const ALLOWED_TRANSITIONS = {
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "cancelled"],
  completed: [],
  cancelled: []
};

exports.handler = async (event) => {
  if (!["GET", "POST", "PATCH"].includes(event.httpMethod)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const identityId = auth.user.sub;
    const athlete = await getAthleteByIdentity(config, identityId);
    if (!athlete) {
      return json(403, { error: "No athlete profile found for this account" });
    }

    if (event.httpMethod === "GET") {
      const instances = await listStrengthPlanInstances(config, { athleteId: athlete.id });
      return json(200, { instances: instances || [] });
    }

    if (event.httpMethod === "POST") {
      const body = parseJsonBody(event);
      const programId = (body.programId || "").toString().trim();
      const startDate = body.startDate ? body.startDate.toString().trim() : null;
      const loadRound = body.loadRound != null ? Number(body.loadRound) : 2.5;

      if (!programId) return json(400, { error: "programId is required" });
      if (!Number.isFinite(loadRound) || loadRound <= 0) {
        return json(400, { error: "loadRound must be a positive number" });
      }

      const program = await getTrainingProgramById(config, programId);
      if (!program) return json(404, { error: "Program not found" });

      const access = await getProgramAssociationAccess(config, {
        athleteId: athlete.id,
        identityId,
        programId
      });
      if (!access.hasAccess) {
        return json(403, {
          error: "No associated training program found for this athlete account",
          code: access.reason
        });
      }

      const plans = await listStrengthPlans(config, { trainingProgramId: programId });
      const template = Array.isArray(plans)
        ? (plans.find((p) => p.status === "active") || plans[0] || null)
        : null;
      if (!template) {
        return json(404, { error: "No strength plan template found for this program" });
      }

      const instance = await createStrengthPlanInstance(config, {
        plan_id: template.id,
        athlete_id: athlete.id,
        start_date: startDate,
        load_round: loadRound,
        status: "active",
        assigned_by: access.assignment?.coach_id || identityId,
        access_model: program.access_model,
        stripe_purchase_id: access.purchase?.id || null,
        program_assignment_id: access.assignment?.id || null,
        coach_locked_until: access.assignment?.computed_end_date || null
      });

      return json(201, { instance });
    }

    if (event.httpMethod === "PATCH") {
      const qs = event.queryStringParameters || {};
      const instanceId = (qs.instanceId || "").toString().trim();
      if (!instanceId) return json(400, { error: "instanceId query parameter is required" });

      const body = parseJsonBody(event);
      const newStatus = (body.status || "").toString().trim();
      if (!newStatus) return json(400, { error: "status is required in request body" });

      const instance = await getStrengthPlanInstanceById(config, instanceId);
      if (!instance || instance.athlete_id !== athlete.id) {
        return json(404, { error: "Instance not found" });
      }

      const trainingProgramId = instance.plan?.training_program_id || null;
      if (!trainingProgramId) {
        return json(409, {
          error: "Instance is not linked to a training program",
          code: "instance_program_missing"
        });
      }

      const access = await getProgramAssociationAccess(config, {
        athleteId: athlete.id,
        identityId,
        programId: trainingProgramId
      });
      if (!access.hasAccess) {
        return json(403, {
          error: "Program association required to manage this instance",
          code: access.reason
        });
      }

      if (instance.coach_locked_until) {
        const today = new Date().toISOString().slice(0, 10);
        if (instance.coach_locked_until >= today) {
          return json(403, {
            error: `This instance is managed by your coach until ${instance.coach_locked_until}. Contact your coach to make changes.`
          });
        }
      }

      const allowed = ALLOWED_TRANSITIONS[instance.status] || [];
      if (!allowed.includes(newStatus)) {
        return json(400, {
          error: `Cannot transition from '${instance.status}' to '${newStatus}'`
        });
      }

      const updated = await updateStrengthPlanInstance(config, instanceId, { status: newStatus });
      return json(200, { instance: updated });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    console.error("[athlete-strength-instance] Unexpected error:", err);
    return json(500, { error: "Internal server error" });
  }
};
