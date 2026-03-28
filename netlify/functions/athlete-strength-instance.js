/**
 * Endpoint: athlete-strength-instance
 *
 * Allows athletes to self-manage their own strength plan instances.
 *
 * Scenarios:
 *   - self_serve: athlete bought a standalone program → can create/manage their instance freely
 *   - coached_one_time: after coach_locked_until date → reverts to self-serve management
 *   - coached_recurring: instances managed by webhook lifecycle, not by athlete directly
 *
 * Routes:
 *   GET  — list all strength plan instances for the authenticated athlete
 *   POST — create a new instance (self-serve / post-coached_one_time only)
 *   PATCH ?instanceId=X — update instance status (cancel/pause/resume)
 */

const { requireAuthenticatedUser } = require("./_lib/authz");
const { getConfig } = require("./_lib/config");
const { parseJsonBody, json } = require("./_lib/http");
const {
  getAthleteByIdentity,
  getActiveStripePurchaseForIdentity,
  getActiveInstanceForAthlete,
  listStrengthPlanInstances,
  listStrengthPlans,
  createStrengthPlanInstance,
  updateStrengthPlanInstance,
  getStrengthPlanInstanceById,
  getTrainingProgramById
} = require("./_lib/supabase");

// Valid status transitions an athlete may request
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

    // ── GET: list all instances ──
    if (event.httpMethod === "GET") {
      const instances = await listStrengthPlanInstances(config, { athleteId: athlete.id });
      return json(200, { instances: instances || [] });
    }

    // ── POST: create a new instance (self-serve) ──
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

      // coached_recurring instances are managed exclusively by the webhook lifecycle
      if (program.access_model === "coached_recurring") {
        return json(403, { error: "Recurring program instances are managed automatically via subscription" });
      }

      // Verify the athlete has a valid purchase for this program
      const purchase = await getActiveStripePurchaseForIdentity(config, { identityId, programId });
      if (!purchase) {
        return json(403, { error: "No active purchase found for this program" });
      }

      // Enforce one active instance at a time
      const existing = await getActiveInstanceForAthlete(config, athlete.id);
      if (existing) {
        return json(409, { error: "An active strength plan instance already exists. Pause or cancel it first." });
      }

      // Find a strength plan template linked to this program
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
        assigned_by: identityId,
        access_model: program.access_model,
        stripe_purchase_id: purchase.id
      });

      return json(201, { instance });
    }

    // ── PATCH: update instance status ──
    if (event.httpMethod === "PATCH") {
      const qs = event.queryStringParameters || {};
      const instanceId = (qs.instanceId || "").toString().trim();
      if (!instanceId) return json(400, { error: "instanceId query parameter is required" });

      const body = parseJsonBody(event);
      const newStatus = (body.status || "").toString().trim();
      if (!newStatus) return json(400, { error: "status is required in request body" });

      // Load and verify ownership
      const instance = await getStrengthPlanInstanceById(config, instanceId);
      if (!instance || instance.athlete_id !== athlete.id) {
        return json(404, { error: "Instance not found" });
      }

      // Enforce coach lock: athlete cannot change status during the coaching period
      if (instance.coach_locked_until) {
        const today = new Date().toISOString().slice(0, 10);
        if (instance.coach_locked_until >= today) {
          return json(403, {
            error: `This instance is managed by your coach until ${instance.coach_locked_until}. Contact your coach to make changes.`
          });
        }
      }

      // Validate transition
      const allowed = ALLOWED_TRANSITIONS[instance.status] || [];
      if (!allowed.includes(newStatus)) {
        return json(400, {
          error: `Cannot transition from '${instance.status}' to '${newStatus}'`
        });
      }

      const updated = await updateStrengthPlanInstance(config, instanceId, { status: newStatus });
      return json(200, { instance: updated });
    }
  } catch (err) {
    console.error("[athlete-strength-instance] Unexpected error:", err);
    return json(500, { error: "Internal server error" });
  }
};
