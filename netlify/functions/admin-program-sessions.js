const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole, requireAuthenticatedUser } = require("./_lib/authz");
const { randomUUID } = require("crypto");
const {
  listProgramWeeklySessions,
  upsertProgramWeeklySessions,
  deleteProgramWeeklySessions,
  getTrainingProgramById,
  getAthleteByIdentity,
  getActiveAssignmentsForAthlete
} = require("./_lib/supabase");

const VALID_SESSION_TYPES = new Set(["strength", "running", "rest", "mobility", "other"]);
const VALID_RUNNING_TYPES = new Set(["easy", "threshold", "interval", "long", "tempo", "repetition", "recovery"]);
const VALID_INTENSITIES = new Set(["low", "moderate", "high", "very_high"]);

function validateSession(entry, index) {
  if (!entry || typeof entry !== "object") {
    throw Object.assign(new Error(`sessions[${index}] must be an object`), { status: 400 });
  }

  const sessionKey = (entry.session_key || "").toString().trim();
  if (!sessionKey) {
    throw Object.assign(new Error(`sessions[${index}].session_key is required`), { status: 400 });
  }

  const sessionType = (entry.session_type || "").toString().trim();
  if (!VALID_SESSION_TYPES.has(sessionType)) {
    throw Object.assign(new Error(`sessions[${index}].session_type must be one of: ${[...VALID_SESSION_TYPES].join(", ")}`), { status: 400 });
  }

  const sessionLabel = (entry.session_label || "").toString().trim();
  if (!sessionLabel) {
    throw Object.assign(new Error(`sessions[${index}].session_label is required`), { status: 400 });
  }

  const strengthDayNumber = entry.strength_day_number == null ? null : Number(entry.strength_day_number);
  if (strengthDayNumber != null && (!Number.isInteger(strengthDayNumber) || strengthDayNumber < 1 || strengthDayNumber > 7)) {
    throw Object.assign(new Error(`sessions[${index}].strength_day_number must be 1-7`), { status: 400 });
  }

  const strengthPlanId = entry.strength_plan_id == null ? null : entry.strength_plan_id.toString().trim() || null;

  const runningSessionType = entry.running_session_type ? entry.running_session_type.toString().trim() : null;
  if (runningSessionType && !VALID_RUNNING_TYPES.has(runningSessionType)) {
    throw Object.assign(new Error(`sessions[${index}].running_session_type is invalid`), { status: 400 });
  }

  const durationEstimateMin = entry.duration_estimate_min == null ? null : Number(entry.duration_estimate_min);
  if (durationEstimateMin != null && (!Number.isInteger(durationEstimateMin) || durationEstimateMin < 0)) {
    throw Object.assign(new Error(`sessions[${index}].duration_estimate_min must be a non-negative integer`), { status: 400 });
  }

  const intensity = entry.intensity ? entry.intensity.toString().trim() : null;
  if (intensity && !VALID_INTENSITIES.has(intensity)) {
    throw Object.assign(new Error(`sessions[${index}].intensity is invalid`), { status: 400 });
  }

  return {
    id: entry.id || randomUUID(),
    session_key: sessionKey,
    session_type: sessionType,
    session_label: sessionLabel,
    strength_plan_id: strengthPlanId,
    strength_day_number: strengthDayNumber,
    running_session_type: runningSessionType,
    duration_estimate_min: durationEstimateMin,
    intensity,
    is_optional: entry.is_optional === true || entry.is_optional === "true",
    sort_priority: Number.isInteger(Number(entry.sort_priority)) ? Number(entry.sort_priority) : index
  };
}

exports.handler = async (event) => {
  const config = getConfig();

  try {
    const qs = event.queryStringParameters || {};

    if (event.httpMethod === "GET") {
      const auth = await requireAuthenticatedUser(event, config);
      if (auth.error) return auth.error;

      const trainingProgramId = qs.trainingProgramId;
      if (!trainingProgramId) {
        return json(400, { error: "trainingProgramId query param is required" });
      }

      // Coach/admin can read any program. Athletes can only read assigned programs.
      const isCoachOrAdmin = auth.roles.includes("coach") || auth.roles.includes("admin");
      if (!isCoachOrAdmin) {
        const athlete = await getAthleteByIdentity(config, auth.user.sub);
        if (!athlete) return json(403, { error: "Forbidden" });
        const assignments = await getActiveAssignmentsForAthlete(config, athlete.id);
        const hasAccess = (assignments || []).some((a) => a.training_program_id === trainingProgramId);
        if (!hasAccess) return json(403, { error: "Forbidden" });
      }

      const sessions = await listProgramWeeklySessions(config, trainingProgramId);
      return json(200, { sessions: sessions || [] });
    }

    if (event.httpMethod === "PUT") {
      const auth = await requireRole(event, config, "coach");
      if (auth.error) return auth.error;

      const body = parseJsonBody(event);
      const trainingProgramId = (body.training_program_id || "").toString().trim();
      if (!trainingProgramId) {
        return json(400, { error: "training_program_id is required" });
      }

      const program = await getTrainingProgramById(config, trainingProgramId);
      if (!program) {
        return json(404, { error: "Program not found" });
      }

      const sessions = (body.sessions || []).map((s, i) => {
        const validated = validateSession(s, i);
        validated.training_program_id = trainingProgramId;
        return validated;
      });

      // Delete sessions that are no longer in the payload
      if (body.delete_session_ids && body.delete_session_ids.length > 0) {
        await deleteProgramWeeklySessions(config, body.delete_session_ids);
      }

      let upserted = [];
      if (sessions.length > 0) {
        upserted = await upsertProgramWeeklySessions(config, sessions);
      }

      return json(200, { sessions: upserted || [] });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal server error" });
  }
};
