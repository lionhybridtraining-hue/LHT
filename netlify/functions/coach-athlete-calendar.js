const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  verifyCoachOwnsAthlete,
  getAthleteById,
  listAthleteWeeklyPlan,
  getProgramAssignmentById,
  getTrainingProgramById,
  getStrengthSessionHistory,
  getStrengthLogSetsForSessions
} = require("./_lib/supabase");

function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addDaysIso(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function pickDefaultWeek(weeks) {
  if (!Array.isArray(weeks) || weeks.length === 0) return null;
  const today = toIsoDate(new Date().toISOString());
  const sorted = [...weeks].sort();
  let picked = null;
  for (const w of sorted) {
    if (w <= today) picked = w;
  }
  return picked || sorted[sorted.length - 1];
}

function sessionKey(instanceId, weekNumber, dayNumber) {
  return `${instanceId || ""}|${Number(weekNumber) || 0}|${Number(dayNumber) || 0}`;
}

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
    const requestedWeekStart = toIsoDate((qs.weekStartDate || "").toString().trim());

    if (!athleteId) {
      return json(400, { error: "athleteId is required" });
    }

    if (!isAdmin) {
      const owns = await verifyCoachOwnsAthlete(config, auth.user.sub, athleteId);
      if (!owns) {
        return json(403, { error: "Forbidden" });
      }
    }

    const athlete = await getAthleteById(config, athleteId);
    if (!athlete) {
      return json(404, { error: "Athlete not found" });
    }

    const allRows = await listAthleteWeeklyPlan(config, {
      athleteId,
      programAssignmentId: undefined,
      weekNumber: undefined
    });

    const rowsSafe = Array.isArray(allRows) ? allRows : [];
    const weekOptions = [...new Set(rowsSafe.map((r) => r.week_start_date).filter(Boolean))].sort();
    const weekStartDate = requestedWeekStart && weekOptions.includes(requestedWeekStart)
      ? requestedWeekStart
      : pickDefaultWeek(weekOptions);

    const weekRows = weekStartDate
      ? rowsSafe.filter((r) => r.week_start_date === weekStartDate)
      : [];

    const assignmentIds = [...new Set(weekRows.map((r) => r.program_assignment_id).filter(Boolean))];
    const assignmentMap = new Map();
    const programMap = new Map();

    for (const assignmentId of assignmentIds) {
      const assignment = await getProgramAssignmentById(config, assignmentId);
      if (!assignment) continue;
      assignmentMap.set(assignmentId, assignment);

      if (assignment.training_program_id && !programMap.has(assignment.training_program_id)) {
        const program = await getTrainingProgramById(config, assignment.training_program_id);
        if (program) {
          programMap.set(assignment.training_program_id, program);
        }
      }
    }

    const completedSessions = await getStrengthSessionHistory(config, athleteId, null, 500);
    const completedSafe = Array.isArray(completedSessions) ? completedSessions : [];
    const sessionIds = completedSafe.map((s) => s.id).filter(Boolean);
    const setRows = sessionIds.length
      ? await getStrengthLogSetsForSessions(config, sessionIds)
      : [];

    const setTotalsBySession = new Map();
    for (const setRow of (Array.isArray(setRows) ? setRows : [])) {
      const sid = setRow.session_id;
      if (!sid) continue;
      const current = setTotalsBySession.get(sid) || { sets: 0, totalKg: 0 };
      const reps = Number(setRow.reps || 0);
      const load = Number(setRow.load_kg || 0);
      current.sets += 1;
      current.totalKg += reps * load;
      setTotalsBySession.set(sid, current);
    }

    const completedBySlot = new Map();
    for (const session of completedSafe) {
      const key = sessionKey(session.instance_id, session.week_number, session.day_number);
      const totals = setTotalsBySession.get(session.id) || { sets: 0, totalKg: 0 };
      const current = completedBySlot.get(key) || {
        completedSessions: 0,
        sets: 0,
        totalKg: 0,
        lastCompletedAt: null
      };
      current.completedSessions += 1;
      current.sets += totals.sets;
      current.totalKg += totals.totalKg;
      const finishedAt = session.finished_at || session.started_at || null;
      if (finishedAt && (!current.lastCompletedAt || finishedAt > current.lastCompletedAt)) {
        current.lastCompletedAt = finishedAt;
      }
      completedBySlot.set(key, current);
    }

    const rows = weekRows.map((row) => {
      const assignment = assignmentMap.get(row.program_assignment_id) || null;
      const program = assignment && assignment.training_program_id
        ? (programMap.get(assignment.training_program_id) || null)
        : null;

      let actual = null;
      let actualStatus = row.status || "planned";

      if (row.session_type === "strength" && row.strength_instance_id && row.strength_day_number != null) {
        const key = sessionKey(row.strength_instance_id, row.week_number, row.strength_day_number);
        const summary = completedBySlot.get(key) || null;
        if (summary) {
          actual = {
            completedSessions: summary.completedSessions,
            sets: summary.sets,
            totalKg: Number(summary.totalKg.toFixed(0)),
            lastCompletedAt: summary.lastCompletedAt
          };
          actualStatus = "completed";
        }
      }

      return {
        ...row,
        calendar_date: addDaysIso(row.week_start_date, row.day_of_week),
        assignment: assignment ? {
          id: assignment.id,
          status: assignment.status,
          start_date: assignment.start_date,
          duration_weeks: assignment.duration_weeks,
          training_program_id: assignment.training_program_id
        } : null,
        program: program ? {
          id: program.id,
          name: program.name,
          preset_selection: program.preset_selection || null
        } : null,
        actual_status: actualStatus,
        actual_summary: actual
      };
    });

    return json(200, {
      athlete: {
        id: athlete.id,
        name: athlete.name || null,
        email: athlete.email || null
      },
      weekStartDate: weekStartDate || null,
      availableWeekStartDates: weekOptions,
      assignments: assignmentIds.map((assignmentId) => {
        const a = assignmentMap.get(assignmentId);
        const p = a && a.training_program_id ? programMap.get(a.training_program_id) : null;
        return {
          id: assignmentId,
          status: a ? a.status : null,
          programId: a ? a.training_program_id : null,
          programName: p ? (p.name || null) : null
        };
      }),
      rows
    });
  } catch (err) {
    console.error("[coach-athlete-calendar] Error:", err.message);
    return json(500, { error: err.message || "Internal server error" });
  }
};
