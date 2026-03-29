const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { listEnrichedAssignments } = require("./_lib/supabase");

/**
 * GET /.netlify/functions/list-assignments
 *
 * Returns program assignments enriched with athlete/coach/program names.
 * - Admin: all assignments
 * - Coach: only assignments for athletes where athletes.coach_identity_id = auth.user.sub
 *
 * Query params:
 *   ?includeHistory=1  → include completed/cancelled (default: active/scheduled/paused only)
 */
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
    const includeHistory = qs.includeHistory === "1";
    const coachIdentityId = isCoach && !isAdmin ? auth.user.sub : null;

    const rows = await listEnrichedAssignments(config, { includeHistory, coachIdentityId });
    const assignments = Array.isArray(rows) ? rows : [];

    return json(200, {
      assignments: assignments.map(mapRow),
      total: assignments.length
    });
  } catch (err) {
    console.error("[list-assignments] Error:", err.message);
    return json(500, { error: err.message || "Internal error" });
  }
};

function mapRow(row) {
  const athlete = row.athlete || {};
  const coach = row.coach || {};
  const program = row.training_program || {};
  return {
    id: row.id,
    athleteId: row.athlete_id,
    athleteName: athlete.name || "",
    athleteEmail: athlete.email || "",
    coachId: row.coach_id,
    coachName: coach.name || "",
    trainingProgramId: row.training_program_id,
    programName: program.name || "",
    status: row.status,
    startDate: row.start_date,
    durationWeeks: row.duration_weeks,
    computedEndDate: row.computed_end_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
