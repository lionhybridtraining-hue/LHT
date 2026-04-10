const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  createProgramAssignment,
  getCurrentProgramAssignment,
  getProgramAssignmentById,
  getLatestCancellableProgramAssignment,
  updateProgramAssignment,
  listAssignmentHistory,
  updateStrengthPlanInstance,
  getTrainingProgramById,
  verifyCoachOwnsAthlete,
  getCoachByIdentityId,
  listStrengthPlanInstances
} = require("./_lib/supabase");

function normalizeAssignmentPayload(payload) {
  const athleteId = (payload.athleteId || "").toString().trim();
  const coachId = payload.coachId != null ? (payload.coachId || "").toString().trim() : null;
  const trainingProgramId = (payload.trainingProgramId || "").toString().trim();
  const startDateInput = (payload.startDate || "").toString().trim();
  const durationWeeks = payload.durationWeeks == null || payload.durationWeeks === ""
    ? null
    : Number(payload.durationWeeks);
  const priceCentsSnapshot = Number(payload.priceCentsSnapshot ?? 0);
  const currencySnapshot = (payload.currencySnapshot || "EUR").toString().trim().toUpperCase() || "EUR";
  const followupTypeSnapshot = (payload.followupTypeSnapshot || "standard").toString().trim() || "standard";
  const notes = payload.notes == null ? null : payload.notes.toString();

  if (!athleteId) throw new Error("athleteId is required");
  if (!trainingProgramId) throw new Error("trainingProgramId is required");

  const startDate = startDateInput || null;
  if (startDate) {
    const parsedDate = new Date(startDate);
    if (Number.isNaN(parsedDate.getTime())) throw new Error("startDate must be a valid date");
  }

  const today = new Date().toISOString().slice(0, 10);
  const status = startDate && startDate > today ? "scheduled" : "active";

  if (durationWeeks != null && (!Number.isInteger(durationWeeks) || durationWeeks <= 0)) {
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
    status,
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
    accessEndDate: row.computed_end_date || null,
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



exports.handler = async (event) => {
  if (!["GET", "POST", "PATCH"].includes(event.httpMethod)) {
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

    // Coach scoping helper — verifies coach owns the athlete
    const ensureCoachScope = async (athleteId) => {
      if (isAdmin) return; // admin can access any athlete
      const owns = await verifyCoachOwnsAthlete(config, auth.user.sub, athleteId);
      if (!owns) throw new Error("Forbidden: athlete not assigned to you");
    };

    if (event.httpMethod === "GET") {
      const query = event.queryStringParameters || {};
      const athleteId = (query.athleteId || "").toString().trim();
      const trainingProgramId = (query.trainingProgramId || "").toString().trim() || null;
      const action = (query.action || "").toString().trim().toLowerCase();

      if (!athleteId) {
        return json(400, { error: "athleteId is required" });
      }

      await ensureCoachScope(athleteId);

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
      await ensureCoachScope(normalized.athlete_id);

      // Auto-assign coach_id when coach creates without explicit coachId
      if (isCoach && !normalized.coach_id) {
        const coachRecord = await getCoachByIdentityId(config, auth.user.sub);
        if (coachRecord) {
          normalized.coach_id = coachRecord.id;
          // Recompute status with coach_id now set
          const today = new Date().toISOString().slice(0, 10);
          normalized.status = normalized.start_date > today ? "scheduled" : "active";
        }
      }
      const program = await getTrainingProgramById(config, normalized.training_program_id);
      if (!program) {
        return json(404, { error: "Training program not found" });
      }
      if (!normalized.start_date) {
        normalized.start_date = program.start_date || new Date().toISOString().slice(0, 10);
      }
      normalized.status = normalized.start_date > new Date().toISOString().slice(0, 10) ? "scheduled" : "active";
      if (normalized.duration_weeks == null) {
        normalized.duration_weeks = program.duration_weeks == null ? null : Number(program.duration_weeks);
      }
      if (normalized.duration_weeks == null) {
        throw new Error("Assignment duration_weeks is required when the program has no default duration");
      }
      if (!Number.isInteger(normalized.duration_weeks) || normalized.duration_weeks <= 0) {
        throw new Error("Program duration_weeks must be a positive integer");
      }
      const created = await createProgramAssignment(config, normalized);

      return json(201, {
        assignment: mapAssignment(created),
        message: "Assignment created. Athlete/coach must select a preset to generate calendar and instances."
      });
    }

    const query = event.queryStringParameters || {};
    const assignmentId = (query.assignmentId || "").toString().trim();
    const action = (query.action || "").toString().trim().toLowerCase();

    if (!assignmentId) {
      return json(400, { error: "assignmentId is required for PATCH" });
    }

    const existingAssignment = await getProgramAssignmentById(config, assignmentId);
    if (!existingAssignment) return json(404, { error: "Assignment not found" });

    // Coach scoping for PATCH: verify ownership via assignment's athlete_id
    if (!isAdmin) {
      await ensureCoachScope(existingAssignment.athlete_id);
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

      const allInstances = await listStrengthPlanInstances(config, {
        athleteId: cancelled.athlete_id
      });

      const relatedById = new Map();
      (Array.isArray(allInstances) ? allInstances : []).forEach((instance) => {
        if (!instance || !instance.id) return;
        const byAssignment = instance.program_assignment_id && instance.program_assignment_id === cancelled.id;
        const byProgram = instance.plan && instance.plan.training_program_id === cancelled.training_program_id;
        if (byAssignment || byProgram) {
          relatedById.set(instance.id, instance);
        }
      });

      const cancellable = Array.from(relatedById.values()).filter((instance) => {
        const currentStatus = (instance.status || "").toString().toLowerCase();
        return currentStatus !== "cancelled" && currentStatus !== "completed";
      });

      const cancelledInstances = await Promise.all(
        cancellable.map((instance) => updateStrengthPlanInstance(config, instance.id, { status: "cancelled" }))
      );

      return json(200, {
        assignment: mapAssignment(cancelled),
        cancelledStrengthInstances: cancelledInstances,
        strengthCancelledCount: cancelledInstances.length
      });
    }

    // Handle edit action for other fields
    const patch = {};

    if (payload.coachId !== undefined) {
      const coachVal = payload.coachId != null ? (payload.coachId || "").toString().trim() : "";
      // Empty coachId means explicit self-serve transition.
      patch.coach_id = coachVal || null;
    }

    if (payload.trainingProgramId !== undefined) {
      throw new Error("trainingProgramId cannot be changed after assignment creation");
    }

    if (payload.startDate !== undefined) {
      const startDateStr = (payload.startDate || "").toString().trim();
      const normalizedStartDate = startDateStr || new Date().toISOString().slice(0, 10);
      const parsedDate = new Date(normalizedStartDate);
      if (Number.isNaN(parsedDate.getTime())) throw new Error("startDate must be a valid date");
      patch.start_date = normalizedStartDate;
    }

    if (payload.endDate !== undefined) {
      throw new Error("endDate is no longer supported in preset-driven assignments");
    }

    if (payload.notes !== undefined) {
      patch.notes = payload.notes == null ? null : payload.notes.toString();
    }

    if (payload.status !== undefined) {
      const status = (payload.status || "").toString().trim().toLowerCase();
      const allowedStatuses = isAdmin
        ? ["active", "scheduled", "paused", "completed", "cancelled"]
        : ["active", "scheduled", "paused"];
      if (!allowedStatuses.includes(status)) {
        throw new Error(`status must be one of: ${allowedStatuses.join(", ")}`);
      }
      patch.status = status;
      if (status === "completed" || status === "cancelled") {
        patch.actual_end_date = new Date().toISOString().slice(0, 10);
      } else {
        patch.actual_end_date = null;
      }
    }

    if (payload.priceCentsSnapshot !== undefined) {
      const priceCentsSnapshot = Number(payload.priceCentsSnapshot);
      if (!Number.isInteger(priceCentsSnapshot) || priceCentsSnapshot < 0) {
        throw new Error("priceCentsSnapshot must be a non-negative integer");
      }
      patch.price_cents_snapshot = priceCentsSnapshot;
    }

    if (payload.currencySnapshot !== undefined) {
      patch.currency_snapshot = (payload.currencySnapshot || "EUR").toString().trim().toUpperCase() || "EUR";
    }

    if (payload.followupTypeSnapshot !== undefined) {
      patch.followup_type_snapshot = (payload.followupTypeSnapshot || "standard").toString().trim() || "standard";
    }

    if (Object.keys(patch).length === 0) {
      return json(400, { error: "No valid fields to update" });
    }

    // computed_end_date remains program-duration snapshot.

    const updated = await updateProgramAssignment(config, assignmentId, patch);

    if (!updated) {
      return json(404, { error: "Assignment not found or update returned no rows" });
    }

    // Auto-cancel strength instances when assignment status changes to cancelled
    if (patch.status === "cancelled") {
      const allInstances = await listStrengthPlanInstances(config, {
        athleteId: updated.athlete_id
      });

      const relatedById = new Map();
      (Array.isArray(allInstances) ? allInstances : []).forEach((instance) => {
        if (!instance || !instance.id) return;
        const byAssignment = instance.program_assignment_id && instance.program_assignment_id === updated.id;
        const byProgram = instance.plan && instance.plan.training_program_id === updated.training_program_id;
        if (byAssignment || byProgram) {
          relatedById.set(instance.id, instance);
        }
      });

      const cancellable = Array.from(relatedById.values()).filter((instance) => {
        const currentStatus = (instance.status || "").toString().toLowerCase();
        return currentStatus !== "cancelled" && currentStatus !== "completed";
      });

      if (cancellable.length) {
        await Promise.all(
          cancellable.map((instance) => updateStrengthPlanInstance(config, instance.id, { status: "cancelled" }))
        );
      }
    }

    return json(200, {
      assignment: mapAssignment(updated)
    });
  } catch (err) {
    console.error("[admin-assign-program] ERROR:", err.message, err.stack);
    if ((err.message || "").includes('null value in column "coach_id"')) {
      return json(409, {
        error: "Self-serve indisponivel: a coluna program_assignments.coach_id ainda esta NOT NULL. Executa scripts/migration-assignment-coach-nullable.sql."
      });
    }
    return json(500, { error: err.message || "Erro ao atribuir programa" });
  }
};
