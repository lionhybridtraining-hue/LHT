const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  listStrengthPlanInstances,
  getStrengthPlanInstanceById,
  updateStrengthPlanInstance,
  createStrengthPlanInstance,
  getStrengthPlanById,
  getStrengthPlanFull
} = require("./_lib/supabase");

const ALLOWED_STATUS = new Set(["active", "paused", "completed", "cancelled"]);

async function buildPlanSnapshot(config, planId) {
  try {
    const full = await getStrengthPlanFull(config, planId);
    if (!full) return null;
    return {
      exercises: full.exercises,
      prescriptions: full.prescriptions,
      phaseNotes: full.phaseNotes || []
    };
  } catch (_) {
    return null;
  }
}

exports.handler = async (event) => {
  if (!["GET", "POST", "PATCH"].includes(event.httpMethod)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const query = event.queryStringParameters || {};

    if (event.httpMethod === "GET") {
      const instanceId = (query.instanceId || "").toString().trim();
      if (instanceId) {
        const instance = await getStrengthPlanInstanceById(config, instanceId);
        if (!instance) return json(404, { error: "Instance not found" });
        return json(200, { instance: mapInstance(instance) });
      }

      const athleteId = (query.athleteId || "").toString().trim() || null;
      const planId = (query.planId || "").toString().trim() || null;
      const status = (query.status || "").toString().trim() || null;
      const programId = (query.programId || "").toString().trim() || null;

      const instances = await listStrengthPlanInstances(config, {
        athleteId: athleteId || undefined,
        planId: planId || undefined,
        status: status || undefined
      });

      const filtered = Array.isArray(instances)
        ? instances.filter((instance) => {
            if (!programId) return true;
            return instance?.plan?.training_program_id === programId;
          })
        : [];

      return json(200, { instances: filtered.map(mapInstance) });
    }

    if (event.httpMethod === "POST") {
      const body = parseJsonBody(event);
      const athleteId = (body.athleteId || "").toString().trim();
      const planId = (body.planId || "").toString().trim();
      const startDate = body.startDate ? body.startDate.toString().trim() : null;
      const loadRound = body.loadRound !== undefined ? Number(body.loadRound) : 2.5;
      const programAssignmentId = body.programAssignmentId ? body.programAssignmentId.toString().trim() : null;
      const coachLockedUntil = body.coachLockedUntil ? body.coachLockedUntil.toString().trim() : null;
      const accessModel = body.accessModel ? body.accessModel.toString().trim() : null;

      if (!athleteId) return json(400, { error: "athleteId is required" });
      if (!planId) return json(400, { error: "planId is required" });
      if (!Number.isFinite(loadRound) || loadRound <= 0) {
        return json(400, { error: "loadRound must be a positive number" });
      }

      const plan = await getStrengthPlanById(config, planId);
      if (!plan) return json(404, { error: "Strength plan not found" });
      if (!plan.training_program_id) {
        return json(400, { error: "Plan has no associated training program" });
      }

      if (startDate) {
        const parsedDate = new Date(startDate);
        if (Number.isNaN(parsedDate.getTime())) {
          return json(400, { error: "startDate must be a valid date" });
        }
      }

      const planSnapshot = await buildPlanSnapshot(config, planId);

      const created = await createStrengthPlanInstance(config, {
        plan_id: planId,
        athlete_id: athleteId,
        start_date: startDate,
        load_round: loadRound,
        status: "active",
        assigned_by: auth.user?.sub || null,
        program_assignment_id: programAssignmentId,
        coach_locked_until: coachLockedUntil,
        access_model: accessModel,
        plan_snapshot: planSnapshot ? JSON.stringify(planSnapshot) : null
      });

      return json(201, {
        instance: mapInstance(created),
        createdBy: auth.user?.sub || null
      });
    }

    // PATCH handler
    const instanceId = (query.instanceId || "").toString().trim();
    if (!instanceId) {
      return json(400, { error: "instanceId is required" });
    }

    const body = parseJsonBody(event);
    const patch = {};

    if (body.status !== undefined) {
      const nextStatus = (body.status || "").toString().trim();
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

    const existing = await getStrengthPlanInstanceById(config, instanceId);
    if (!existing) return json(404, { error: "Instance not found" });

    const updated = await updateStrengthPlanInstance(config, instanceId, patch);
    return json(200, {
      instance: mapInstance(updated),
      previousStatus: existing.status,
      updatedBy: auth.user?.sub || null
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
    plan: instance.plan || null
  };
}
