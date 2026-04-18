/**
 * GET /coach-calendar-week?athleteId=<uuid>[&assignmentId=<uuid>][&week=<number>]
 *
 * Returns a clean CalendarWeek view-model for the coach UI.
 * Aggregates athlete_weekly_plan rows with program context.
 *
 * If week is omitted, returns the latest materialised week.
 */
const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { verifyCoachOwnsAthlete } = require("./_lib/supabase");
const { composeCalendarWeek } = require("./_lib/view-models");

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

    const assignmentId = (qs.assignmentId || "").toString().trim() || null;
    const rawWeek = qs.week != null ? Number(qs.week) : null;
    const weekNumber = rawWeek != null && Number.isFinite(rawWeek) ? rawWeek : null;
    const weekStartDate = (qs.weekStartDate || "").toString().trim() || null;

    const calendar = await composeCalendarWeek(config, athleteId, {
      programAssignmentId: assignmentId,
      weekNumber,
      weekStartDate,
    });
    return json(200, calendar);
  } catch (err) {
    console.error("[coach-calendar-week]", err);
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal error" });
  }
};
