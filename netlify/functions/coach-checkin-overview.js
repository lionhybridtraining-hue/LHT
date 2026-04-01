const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  listAthletesByCoach,
  listWeeklyCheckinsByAthleteIds
} = require("./_lib/supabase");

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function parseIsoDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "")) return null;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mondayOfWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday=0
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const config = getConfig();
  const auth = await requireRole(event, config, "coach");
  if (auth.error) return auth.error;

  try {
    const qs = event.queryStringParameters || {};

    const now = new Date();
    const requestedWeek = parseIsoDate((qs.weekStart || "").toString().trim());
    const selectedWeekDate = mondayOfWeek(requestedWeek || now);
    const selectedWeekStart = isoDate(selectedWeekDate);

    const trendWeeksRaw = Number(qs.trendWeeks || 8);
    const trendWeeks = Number.isInteger(trendWeeksRaw) ? Math.min(Math.max(trendWeeksRaw, 2), 16) : 8;

    const pendingLimitRaw = Number(qs.pendingLimit || 20);
    const pendingLimit = Number.isInteger(pendingLimitRaw) ? Math.min(Math.max(pendingLimitRaw, 5), 100) : 20;

    const athletes = await listAthletesByCoach(config, auth.user.sub);
    const athleteList = Array.isArray(athletes) ? athletes : [];
    const athleteIds = athleteList.map((a) => a.id).filter(Boolean);

    if (athleteIds.length === 0) {
      return json(200, {
        weekStart: selectedWeekStart,
        summary: {
          totalAthletes: 0,
          totalSent: 0,
          responded: 0,
          approved: 0,
          pendingCoach: 0,
          responseRatePct: 0,
          strengthDone: 0,
          strengthNotDone: 0,
          strengthCompliancePct: 0
        },
        trend: [],
        pending: [],
        strengthAudit: []
      });
    }

    const trendStart = new Date(selectedWeekDate);
    trendStart.setUTCDate(trendStart.getUTCDate() - (trendWeeks - 1) * 7);

    const allRows = await listWeeklyCheckinsByAthleteIds(config, athleteIds, {
      from: isoDate(trendStart),
      to: selectedWeekStart,
      limit: 10000
    });

    const rows = Array.isArray(allRows) ? allRows : [];
    const athleteMap = new Map(athleteList.map((a) => [a.id, a]));

    const weekRows = rows.filter((r) => r.week_start === selectedWeekStart);
    const respondedCount = weekRows.filter((r) => !!r.responded_at).length;
    const approvedCount = weekRows.filter((r) => !!r.approved_at || r.status === "approved").length;
    const pendingCoachCount = weekRows.filter((r) => r.status === "pending_coach").length;

    const strengthDone = weekRows.reduce((acc, r) => acc + (Number.isInteger(r.strength_planned_done_count) ? r.strength_planned_done_count : 0), 0);
    const strengthNotDone = weekRows.reduce((acc, r) => acc + (Number.isInteger(r.strength_planned_not_done_count) ? r.strength_planned_not_done_count : 0), 0);

    const trendByWeek = new Map();
    rows.forEach((r) => {
      const key = r.week_start;
      if (!key) return;
      if (!trendByWeek.has(key)) {
        trendByWeek.set(key, { weekStart: key, totalSent: 0, responded: 0, approved: 0 });
      }
      const agg = trendByWeek.get(key);
      agg.totalSent += 1;
      if (r.responded_at) agg.responded += 1;
      if (r.approved_at || r.status === "approved") agg.approved += 1;
    });

    const trend = Array.from(trendByWeek.values())
      .map((w) => ({
        weekStart: w.weekStart,
        totalSent: w.totalSent,
        responded: w.responded,
        approved: w.approved,
        responseRatePct: pct(w.responded, w.totalSent)
      }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    const pending = weekRows
      .filter((r) => r.status === "pending_coach")
      .sort((a, b) => {
        const at = a.responded_at || a.week_start;
        const bt = b.responded_at || b.week_start;
        return String(at || "").localeCompare(String(bt || ""));
      })
      .slice(0, pendingLimit)
      .map((r) => {
        const athlete = athleteMap.get(r.athlete_id) || {};
        return {
          checkinId: r.id,
          athleteId: r.athlete_id,
          athleteName: athlete.name || athlete.email || r.athlete_id,
          weekStart: r.week_start,
          status: r.status,
          respondedAt: r.responded_at || null
        };
      });

    const strengthByAthlete = new Map();
    weekRows.forEach((r) => {
      const key = r.athlete_id;
      if (!key) return;
      if (!strengthByAthlete.has(key)) {
        const athlete = athleteMap.get(key) || {};
        strengthByAthlete.set(key, {
          athleteId: key,
          athleteName: athlete.name || athlete.email || key,
          totalDone: 0,
          totalNotDone: 0
        });
      }
      const agg = strengthByAthlete.get(key);
      agg.totalDone += Number.isInteger(r.strength_planned_done_count) ? r.strength_planned_done_count : 0;
      agg.totalNotDone += Number.isInteger(r.strength_planned_not_done_count) ? r.strength_planned_not_done_count : 0;
    });

    const strengthAudit = Array.from(strengthByAthlete.values())
      .map((a) => ({
        ...a,
        compliancePct: pct(a.totalDone, a.totalDone + a.totalNotDone)
      }))
      .sort((a, b) => a.compliancePct - b.compliancePct);

    return json(200, {
      weekStart: selectedWeekStart,
      summary: {
        totalAthletes: athleteIds.length,
        totalSent: weekRows.length,
        responded: respondedCount,
        approved: approvedCount,
        pendingCoach: pendingCoachCount,
        responseRatePct: pct(respondedCount, weekRows.length),
        strengthDone,
        strengthNotDone,
        strengthCompliancePct: pct(strengthDone, strengthDone + strengthNotDone)
      },
      trend,
      pending,
      strengthAudit
    });
  } catch (err) {
    return json(err.status || 500, { error: err.message || "Internal server error" });
  }
};
