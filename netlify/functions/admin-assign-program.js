const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  createProgramAssignment,
  getCurrentProgramAssignment,
  getLatestCancellableProgramAssignment,
  updateProgramAssignment,
  listAssignmentHistory,
  listStrengthPlans,
  getActiveInstanceForAthlete,
  createStrengthPlanInstance,
  updateStrengthPlanInstance
} = require("./_lib/supabase");

function normalizeAssignmentPayload(payload) {
  const athleteId = (payload.athleteId || "").toString().trim();
  const coachId = (payload.coachId || "").toString().trim();
  const trainingProgramId = (payload.trainingProgramId || "").toString().trim();
  const startDateInput = (payload.startDate || "").toString().trim();
  const durationWeeks = Number(payload.durationWeeks);
  const priceCentsSnapshot = Number(payload.priceCentsSnapshot ?? 0);
  const currencySnapshot = (payload.currencySnapshot || "EUR").toString().trim().toUpperCase() || "EUR";
  const followupTypeSnapshot = (payload.followupTypeSnapshot || "standard").toString().trim() || "standard";
  const notes = payload.notes == null ? null : payload.notes.toString();

  if (!athleteId) throw new Error("athleteId is required");
  if (!coachId) throw new Error("coachId is required");
  if (!trainingProgramId) throw new Error("trainingProgramId is required");

  const startDate = startDateInput || new Date().toISOString().slice(0, 10);
  const parsedDate = new Date(startDate);
  if (Number.isNaN(parsedDate.getTime())) throw new Error("startDate must be a valid date");

  if (!Number.isInteger(durationWeeks) || durationWeeks <= 0) {
    throw new Error("durationWeeks must be a positive integer");
  }

  if (!Number.isInteger(priceCentsSnapshot) || priceCentsSnapshot < 0) {
    throw new Error("priceCentsSnapshot must be a non-negative integer");
  }

  return {
    athlete_id: athleteId,
    coach_id: coachId,
    training_program_id: trainingProgramId,
    start_date: startDate,
    duration_weeks: durationWeeks,
    status: "scheduled",
    price_cents_snapshot: priceCentsSnapshot,
    currency_snapshot: currencySnapshot,
    followup_type_snapshot: followupTypeSnapshot,
    notes
  };
}

function mapAssignment(row) {
  return {
    id: row.id,
    athleteId: row.athlete_id,
    coachId: row.coach_id,
    trainingProgramId: row.training_program_id,
    startDate: row.start_date,
    durationWeeks: row.duration_weeks,
    computedEndDate: row.computed_end_date,
    actualEndDate: row.actual_end_date,
    status: row.status,
    priceCentsSnapshot: row.price_cents_snapshot,
    currencySnapshot: row.currency_snapshot,
    followupTypeSnapshot: row.followup_type_snapshot,
    notes: row.notes,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function mapStrengthInstance(row) {
  if (!row) return null;
  return {
    id: row.id,
    planId: row.plan_id,
    athleteId: row.athlete_id,
    startDate: row.start_date,
    loadRound: row.load_round,
    status: row.status,
    assignedBy: row.assigned_by,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

async function ensureStrengthInstanceForAssignment(config, assignment) {
  const activeInstance = await getActiveInstanceForAthlete(config, assignment.athlete_id);
  if (activeInstance) {
    return { instance: activeInstance, autoCreated: false, reason: "already_active" };
  }

  const plans = await listStrengthPlans(config, {
    trainingProgramId: assignment.training_program_id
  });
  const selectedPlan = Array.isArray(plans)
    ? (plans.find((plan) => plan.status === "active") || plans[0] || null)
    : null;

  if (!selectedPlan) {
    return { instance: null, autoCreated: false, reason: "no_strength_template_for_program" };
  }

  const createdInstance = await createStrengthPlanInstance(config, {
    plan_id: selectedPlan.id,
    athlete_id: assignment.athlete_id,
    start_date: assignment.start_date || null,
    load_round: selectedPlan.load_round != null ? selectedPlan.load_round : 2.5,
    status: "active",
    assigned_by: assignment.coach_id
  });

  return { instance: createdInstance, autoCreated: true, reason: "created" };
}

exports.handler = async (event) => {
  if (!["GET", "POST", "PATCH"].includes(event.httpMethod)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    if (event.httpMethod === "GET") {
      const query = event.queryStringParameters || {};
      const athleteId = (query.athleteId || "").toString().trim();
      const trainingProgramId = (query.trainingProgramId || "").toString().trim() || null;
      const action = (query.action || "").toString().trim().toLowerCase();

      if (!athleteId) {
        return json(400, { error: "athleteId is required" });
      }

      if (action === "history") {
        const limit = Math.min(Number(query.limit) || 50, 100);
        const history = await listAssignmentHistory(config, athleteId, limit);
        return json(200, {
          assignments: Array.isArray(history) ? history.map(mapAssignment) : []
        });
      }

      const assignment = await getCurrentProgramAssignment(config, athleteId, trainingProgramId);
      return json(200, {
        assignment: assignment ? mapAssignment(assignment) : null
      });
    }

    const payload = parseJsonBody(event);

    if (event.httpMethod === "POST") {
      const normalized = normalizeAssignmentPayload(payload);
      const created = await createProgramAssignment(config, normalized);
      const strength = await ensureStrengthInstanceForAssignment(config, normalized);

      return json(201, {
        assignment: mapAssignment(created),
        strengthInstance: mapStrengthInstance(strength.instance),
        strengthAutoCreated: strength.autoCreated,
        strengthReason: strength.reason
      });
    }

    const query = event.queryStringParameters || {};
    const assignmentId = (query.assignmentId || "").toString().trim();
    const action = (query.action || "").toString().trim().toLowerCase();

    if (!assignmentId) {
      return json(400, { error: "assignmentId is required for PATCH" });
    }

    // Handle cancel action for backward compatibility
    if (action === "cancel" || payload.action === "cancel") {
      const patch = {
        status: "cancelled",
        actual_end_date: new Date().toISOString().slice(0, 10)
      };
      if (payload.notes != null) {
        patch.notes = payload.notes.toString();
      }

      const cancelled = await updateProgramAssignment(config, assignmentId, patch);

      let pausedInstance = null;
      const activeInstance = await getActiveInstanceForAthlete(config, cancelled.athlete_id);
      if (
        activeInstance &&
        activeInstance.id &&
        activeInstance.plan &&
        activeInstance.plan.training_program_id === cancelled.training_program_id
      ) {
        pausedInstance = await updateStrengthPlanInstance(config, activeInstance.id, { status: "paused" });
      }

      return json(200, {
        assignment: mapAssignment(cancelled),
        pausedStrengthInstance: mapStrengthInstance(pausedInstance),
        strengthPaused: Boolean(pausedInstance)
      });
    }

    // Handle edit action for other fields
    const patch = {};

    if (payload.coachId !== undefined) {
      patch.coach_id = (payload.coachId || "").toString().trim();
      if (!patch.coach_id) throw new Error("coachId cannot be empty");
    }

    if (payload.startDate !== undefined) {
      const startDateStr = (payload.startDate || "").toString().trim();
      const parsedDate = new Date(startDateStr);
      if (Number.isNaN(parsedDate.getTime())) throw new Error("startDate must be a valid date");
      patch.start_date = startDateStr;
    }

    if (payload.durationWeeks !== undefined) {
      const weeks = Number(payload.durationWeeks);
      if (!Number.isInteger(weeks) || weeks <= 0) {
        throw new Error("durationWeeks must be a positive integer");
      }
      patch.duration_weeks = weeks;
    }

    if (payload.notes !== undefined) {
      patch.notes = payload.notes == null ? null : payload.notes.toString();
    }

    if (payload.status !== undefined) {
      const status = (payload.status || "").toString().trim().toLowerCase();
      const allowedStatuses = ["active", "scheduled", "paused"];
      if (!allowedStatuses.includes(status)) {
        throw new Error(`status must be one of: ${allowedStatuses.join(", ")}`);
      }
      patch.status = status;
    }

    if (Object.keys(patch).length === 0) {
      return json(400, { error: "No valid fields to update" });
    }

    const updated = await updateProgramAssignment(config, assignmentId, patch);

    return json(200, {
      assignment: mapAssignment(updated)
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao atribuir programa" });
  }
};
