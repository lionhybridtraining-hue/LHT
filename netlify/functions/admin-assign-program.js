const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { createProgramAssignment } = require("./_lib/supabase");

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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const payload = parseJsonBody(event);
    const normalized = normalizeAssignmentPayload(payload);
    const created = await createProgramAssignment(config, normalized);

    return json(201, { assignment: mapAssignment(created) });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao atribuir programa" });
  }
};
