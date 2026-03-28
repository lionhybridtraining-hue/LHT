/**
 * admin-coach-analytics — Aggregated KPI endpoint for the Coaches analytics dashboard.
 *
 * ─── QUERY PARAMETERS ────────────────────────────────────────────────────────
 * preset          string  Period preset. Options:
 *                   "7d"     Last 7 days  (today − 6 days to today, inclusive)
 *                   "30d"    Last 30 days (today − 29 days to today)  [default]
 *                   "month"  Current calendar month (1st of month → today)
 *                   "all"    No date filter — snapshot of current state
 *                   "custom" Use explicit from / to params below
 * from            string  ISO date YYYY-MM-DD. Lower bound (inclusive). Only used when preset=custom.
 * to              string  ISO date YYYY-MM-DD. Upper bound (inclusive). Only used when preset=custom.
 * coachIdentityId string  If provided, result rows and totals are scoped to that coach only.
 *
 * ─── RESPONSE SHAPE ──────────────────────────────────────────────────────────
 * {
 *   meta:    { preset, from, to, selectedCoachIdentityId },
 *   coaches: [ CoachRow, ... ],   // one entry per coach (filtered if coachIdentityId provided)
 *   totals:  CoachRow             // sum/aggregate across all returned rows
 * }
 *
 * ─── METRICS (CoachRow fields) ───────────────────────────────────────────────
 *
 * totalAthletes
 *   How many athletes are currently assigned to this coach.
 *   Source: athletes.coach_identity_id (snapshot, no period filter).
 *
 * activeAssignments
 *   Program assignments in status active/scheduled/paused for this coach's athletes.
 *   Source: program_assignments via listActiveAssignmentsWithPrograms (snapshot fetch).
 *   Period filter: assignment.created_at (fallback start_date) must be within the range.
 *   preset=all → counts all currently-active assignments regardless of start date.
 *   Note: snapshot-based — only assignments currently active are candidates.
 *
 * activeStrengthInstances
 *   Strength plan instances with status='active' for this coach's athletes.
 *   Source: strength_plan_instances via listStrengthPlanInstances (snapshot fetch).
 *   Period filter: instance.created_at (fallback start_date) must be within the range.
 *   preset=all → counts all currently-active instances regardless of start date.
 *   Note: snapshot-based — only currently-active instances are candidates.
 *
 * recurringBillingActiveAthletes
 *   Athletes with an active paid stripe_purchase where billing_type is 'recurring' or 'subscription'.
 *   Source: stripe_purchases via getPayingStatusForAthletes.
 *   Period filter: paying.paidAt must be within the range.
 *   preset=all → all currently-paying recurring athletes regardless of payment date.
 *
 * checkinsPending
 *   Weekly check-ins in status 'pending_coach' (athlete responded, coach hasn't approved yet).
 *   Source: weekly_checkins filtered by week_start on the DB side.
 *   Period filter: applied via Supabase query (week_start >= from AND week_start <= to).
 *   Note: these check-ins ALSO appear in checkinsAnswered — the overlap is intentional
 *   to show the review pipeline (athlete responded → pending coach approval).
 *
 * checkinsAnswered
 *   Weekly check-ins where the athlete has responded: status='approved' OR responded_at IS NOT NULL.
 *   Source: same DB query as checkinsPending (week_start period filter).
 *   Note: 'pending_coach' items that have responded_at set are counted here AND in
 *   checkinsPending. True "closed" check-ins are those with status='approved'.
 *
 * strengthPlansCreatedInRange
 *   Strength plan templates created by this coach within the selected period.
 *   Source: strength_plans (created_by = coach identity_id) via listStrengthPlans (full list, JS filter).
 *   Period filter: plan.created_at must be within the range.
 *
 * strengthPlansCreatedTotal
 *   Total strength plan templates ever created by this coach (no period filter).
 *   Source: same as above, no date restriction.
 *
 * strengthAdherencePct  (number | null)
 *   Percentage of planned strength sessions completed by athletes in this period.
 *   Formula: (strengthCompletedSessions / strengthPlannedSessions) × 100, rounded to 1 decimal.
 *   Source: weekly_checkins fields strength_planned_done_count and strength_planned_not_done_count.
 *   Returns null when strengthPlannedSessions === 0 (no strength data in the period).
 *
 * strengthCompletedSessions   raw numerator for the adherence calculation.
 * strengthPlannedSessions     raw denominator (done + not-done) for the adherence calculation.
 */

const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  listCoaches,
  listAllAthletesForAdmin,
  listActiveAssignmentsWithPrograms,
  listStrengthPlanInstances,
  listStrengthPlans,
  getPayingStatusForAthletes,
  listWeeklyCheckinsByAthleteIds
} = require("./_lib/supabase");

function parseDateInput(raw) {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function getDateRange(query) {
  const preset = String((query || {}).preset || "30d").trim().toLowerCase();
  const fromParam = parseDateInput((query || {}).from);
  const toParam = parseDateInput((query || {}).to);

  if (preset === "custom") {
    return {
      preset,
      from: fromParam,
      to: toParam
    };
  }

  if (preset === "all") {
    return { preset, from: null, to: null };
  }

  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let start = new Date(end);

  if (preset === "7d") {
    start.setUTCDate(start.getUTCDate() - 6);
  } else if (preset === "month") {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  } else {
    start.setUTCDate(start.getUTCDate() - 29);
  }

  return {
    preset,
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10)
  };
}

function isRecurringBillingType(value) {
  const billing = String(value || "").trim().toLowerCase();
  return billing === "recurring" || billing === "subscription";
}

function normalizeCoachKey(value) {
  if (value == null) return "";
  return String(value).trim();
}

function isDateWithinRange(isoLike, range) {
  if (!isoLike) return false;
  const value = String(isoLike).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (range && range.from && value < range.from) return false;
  if (range && range.to && value > range.to) return false;
  return true;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const query = event.queryStringParameters || {};
    const selectedCoachIdentityId = normalizeCoachKey(query.coachIdentityId || "");
    const range = getDateRange(query);

    const [coachesRaw, athletesRaw, assignmentsRaw, strengthInstancesRaw, allStrengthPlansRaw] = await Promise.all([
      listCoaches(config),
      listAllAthletesForAdmin(config),
      listActiveAssignmentsWithPrograms(config),
      listStrengthPlanInstances(config, { status: "active" }),
      listStrengthPlans(config, {})
    ]);

    const coaches = Array.isArray(coachesRaw) ? coachesRaw : [];
    const athletes = Array.isArray(athletesRaw) ? athletesRaw : [];
    const assignments = Array.isArray(assignmentsRaw) ? assignmentsRaw : [];
    const strengthInstances = Array.isArray(strengthInstancesRaw) ? strengthInstancesRaw : [];
    const allStrengthPlans = Array.isArray(allStrengthPlansRaw) ? allStrengthPlansRaw : [];

    const coachByIdentity = new Map();
    coaches.forEach((coach) => {
      const identityId = normalizeCoachKey(coach.identity_id);
      if (!identityId) return;
      coachByIdentity.set(identityId, coach);
    });

    const athletesByCoachIdentity = new Map();
    const athleteById = new Map();
    const athleteIdentityIds = [];

    athletes.forEach((athlete) => {
      const athleteId = normalizeCoachKey(athlete.id);
      if (!athleteId) return;
      athleteById.set(athleteId, athlete);

      if (typeof athlete.identity_id === "string" && athlete.identity_id.length > 0) {
        athleteIdentityIds.push(athlete.identity_id);
      }

      const coachIdentityId = normalizeCoachKey(athlete.coach_identity_id);
      if (!coachIdentityId) return;
      if (!athletesByCoachIdentity.has(coachIdentityId)) {
        athletesByCoachIdentity.set(coachIdentityId, []);
      }
      athletesByCoachIdentity.get(coachIdentityId).push(athlete);
    });

    const payingMap = await getPayingStatusForAthletes(config, athleteIdentityIds);

    const allAthleteIds = athletes.map((athlete) => normalizeCoachKey(athlete.id)).filter(Boolean);
    const checkinsRaw = await listWeeklyCheckinsByAthleteIds(config, allAthleteIds, {
      from: range.from,
      to: range.to,
      limit: 10000
    });
    const checkins = Array.isArray(checkinsRaw) ? checkinsRaw : [];
    const usePeriodFilter = Boolean(range.from || range.to);

    const assignmentsByAthleteId = new Map();
    assignments.forEach((assignment) => {
      const athleteId = normalizeCoachKey(assignment.athlete_id);
      if (!athleteId) return;
      assignmentsByAthleteId.set(athleteId, assignment);
    });

    const activeStrengthByAthleteId = new Map();
    strengthInstances.forEach((instance) => {
      const athleteId = normalizeCoachKey(instance.athlete_id);
      if (!athleteId) return;
      if (!activeStrengthByAthleteId.has(athleteId)) {
        activeStrengthByAthleteId.set(athleteId, instance);
      }
    });

    const strengthPlansByCoach = new Map();
    allStrengthPlans.forEach((plan) => {
      const createdBy = normalizeCoachKey(plan.created_by);
      if (!createdBy) return;
      if (!strengthPlansByCoach.has(createdBy)) {
        strengthPlansByCoach.set(createdBy, []);
      }
      strengthPlansByCoach.get(createdBy).push(plan);
    });

    const checkinsByCoach = new Map();
    checkins.forEach((checkin) => {
      const athleteId = normalizeCoachKey(checkin.athlete_id);
      if (!athleteId) return;
      const athlete = athleteById.get(athleteId);
      if (!athlete) return;
      const coachIdentityId = normalizeCoachKey(athlete.coach_identity_id);
      if (!coachIdentityId) return;
      if (!checkinsByCoach.has(coachIdentityId)) {
        checkinsByCoach.set(coachIdentityId, []);
      }
      checkinsByCoach.get(coachIdentityId).push(checkin);
    });

    const rows = coaches.map((coach) => {
      const coachIdentityId = normalizeCoachKey(coach.identity_id);
      const coachAthletes = athletesByCoachIdentity.get(coachIdentityId) || [];
      const coachAthleteIds = new Set(coachAthletes.map((athlete) => normalizeCoachKey(athlete.id)).filter(Boolean));

      let activeAssignments = 0;
      let activeStrengthInstances = 0;
      let recurringBillingActiveAthletes = 0;

      coachAthletes.forEach((athlete) => {
        const athleteId = normalizeCoachKey(athlete.id);
        const assignment = athleteId ? assignmentsByAthleteId.get(athleteId) : null;
        if (assignment) {
          const assignmentDate = assignment.created_at || assignment.start_date || null;
          if (!usePeriodFilter || isDateWithinRange(assignmentDate, range)) {
            activeAssignments += 1;
          }
        }

        const activeStrength = athleteId ? activeStrengthByAthleteId.get(athleteId) : null;
        if (activeStrength) {
          const strengthDate = activeStrength.created_at || activeStrength.start_date || null;
          if (!usePeriodFilter || isDateWithinRange(strengthDate, range)) {
            activeStrengthInstances += 1;
          }
        }

        const identityId = typeof athlete.identity_id === "string" ? athlete.identity_id : "";
        const paying = identityId ? (payingMap[identityId] || null) : null;
        if (paying && paying.isPaying && isRecurringBillingType(paying.billingType)) {
          if (!usePeriodFilter || isDateWithinRange(paying.paidAt, range)) {
            recurringBillingActiveAthletes += 1;
          }
        }
      });

      const coachCheckins = checkinsByCoach.get(coachIdentityId) || [];
      let checkinsPending = 0;
      let checkinsAnswered = 0;
      let strengthCompletedSessions = 0;
      let strengthPlannedSessions = 0;

      coachCheckins.forEach((checkin) => {
        if (checkin.status === "pending_coach") {
          checkinsPending += 1;
        }

        if (checkin.status === "approved" || checkin.responded_at || checkin.approved_at) {
          checkinsAnswered += 1;
        }

        const doneCount = Number.isFinite(Number(checkin.strength_planned_done_count))
          ? Number(checkin.strength_planned_done_count)
          : 0;
        const notDoneCount = Number.isFinite(Number(checkin.strength_planned_not_done_count))
          ? Number(checkin.strength_planned_not_done_count)
          : 0;

        strengthCompletedSessions += doneCount;
        strengthPlannedSessions += (doneCount + notDoneCount);
      });

      const plans = strengthPlansByCoach.get(coachIdentityId) || [];
      const strengthPlansCreatedTotal = plans.length;
      const strengthPlansCreatedInRange = plans.filter((plan) => {
        const createdAt = plan && plan.created_at ? String(plan.created_at).slice(0, 10) : null;
        if (!createdAt) return false;
        if (range.from && createdAt < range.from) return false;
        if (range.to && createdAt > range.to) return false;
        return true;
      }).length;

      const strengthAdherencePct = strengthPlannedSessions > 0
        ? Number(((strengthCompletedSessions / strengthPlannedSessions) * 100).toFixed(1))
        : null;

      return {
        coachId: coach.id,
        coachIdentityId,
        coachName: coach.name || coach.email || "Coach",
        coachEmail: coach.email || "",
        totalAthletes: coachAthletes.length,
        activeAssignments,
        activeStrengthInstances,
        recurringBillingActiveAthletes,
        checkinsPending,
        checkinsAnswered,
        strengthPlansCreatedInRange,
        strengthPlansCreatedTotal,
        strengthCompletedSessions,
        strengthPlannedSessions,
        strengthAdherencePct
      };
    });

    const filteredRows = selectedCoachIdentityId
      ? rows.filter((row) => row.coachIdentityId === selectedCoachIdentityId)
      : rows;

    const totals = filteredRows.reduce((acc, row) => {
      acc.totalAthletes += row.totalAthletes;
      acc.activeAssignments += row.activeAssignments;
      acc.activeStrengthInstances += row.activeStrengthInstances;
      acc.recurringBillingActiveAthletes += row.recurringBillingActiveAthletes;
      acc.checkinsPending += row.checkinsPending;
      acc.checkinsAnswered += row.checkinsAnswered;
      acc.strengthPlansCreatedInRange += row.strengthPlansCreatedInRange;
      acc.strengthPlansCreatedTotal += row.strengthPlansCreatedTotal;
      acc.strengthCompletedSessions += row.strengthCompletedSessions;
      acc.strengthPlannedSessions += row.strengthPlannedSessions;
      return acc;
    }, {
      totalAthletes: 0,
      activeAssignments: 0,
      activeStrengthInstances: 0,
      recurringBillingActiveAthletes: 0,
      checkinsPending: 0,
      checkinsAnswered: 0,
      strengthPlansCreatedInRange: 0,
      strengthPlansCreatedTotal: 0,
      strengthCompletedSessions: 0,
      strengthPlannedSessions: 0
    });

    totals.strengthAdherencePct = totals.strengthPlannedSessions > 0
      ? Number(((totals.strengthCompletedSessions / totals.strengthPlannedSessions) * 100).toFixed(1))
      : null;

    return json(200, {
      meta: {
        preset: range.preset,
        from: range.from,
        to: range.to,
        selectedCoachIdentityId: selectedCoachIdentityId || null
      },
      coaches: filteredRows,
      totals
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao carregar analytics de coaches" });
  }
};
