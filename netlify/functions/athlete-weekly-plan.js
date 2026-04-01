const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  getProgramSchedulePresetById,
  listProgramScheduleSlots,
  listProgramWeeklySessions,
  getProgramAssignmentById,
  listStrengthPlanInstances,
  insertAthleteWeeklyPlanRows,
  deleteAthleteWeeklyPlan,
  deleteAthleteWeeklyPlanFromWeek,
  listAthleteWeeklyPlan,
  updateAthleteWeeklyPlanRow,
  updateStrengthPlanInstance,
  getAthleteByIdentity
} = require("./_lib/supabase");

const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/**
 * Resolves running session data from plan_data JSONB for a given week.
 * plan_data structure: { phase1: { "1": [...sessions], "2": [...] }, phase2: { ... } }
 */
function resolveRunningSession(planData, weekNumber, runningSessionType) {
  if (!planData || !runningSessionType) return null;

  // Determine which phase and relative week
  let cumulativeWeek = 0;
  for (const phaseKey of ["phase1", "phase2", "phase3"]) {
    const phase = planData[phaseKey];
    if (!phase || typeof phase !== "object") continue;

    const weekKeys = Object.keys(phase)
      .filter((k) => !isNaN(Number(k)))
      .sort((a, b) => Number(a) - Number(b));

    for (const wk of weekKeys) {
      cumulativeWeek++;
      if (cumulativeWeek === weekNumber) {
        const sessions = phase[wk];
        if (!Array.isArray(sessions)) return null;

        // Match by session type
        const typeMap = {
          easy: ["easy", "recovery"],
          threshold: ["threshold", "tempo"],
          interval: ["intervals", "interval"],
          long: ["long run", "long"],
          tempo: ["tempo", "threshold"],
          repetition: ["repetition", "repetitions"],
          recovery: ["recovery", "easy"]
        };

        const matchTerms = typeMap[runningSessionType] || [runningSessionType];
        const matched = sessions.find((s) => {
          const title = (s.title || s.description || "").toLowerCase();
          return matchTerms.some((term) => title.includes(term));
        });

        return matched || null;
      }
    }
  }
  return null;
}

/**
 * Generates athlete_weekly_plan rows from a preset + assignment data.
 */
function generateWeeklyPlanRows({
  athleteId,
  assignmentId,
  totalWeeks,
  startDate,
  slots,
  sessions,
  strengthInstanceId,
  planData,
  source,
  presetId,
  fromWeek
}) {
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const rows = [];
  const effectiveFromWeek = fromWeek || 1;

  for (let week = effectiveFromWeek; week <= totalWeeks; week++) {
    // Calculate week_start_date (Monday of each week)
    const weekStartDate = new Date(startDate);
    weekStartDate.setDate(weekStartDate.getDate() + (week - 1) * 7);
    const weekStartStr = weekStartDate.toISOString().slice(0, 10);

    for (const slot of slots) {
      const session = sessionMap.get(slot.session_id);
      if (!session) continue;

      const row = {
        athlete_id: athleteId,
        program_assignment_id: assignmentId,
        week_number: week,
        week_start_date: weekStartStr,
        day_of_week: slot.day_of_week,
        time_slot: slot.time_slot,
        session_key: session.session_key,
        session_type: session.session_type,
        session_label: session.session_label,
        duration_estimate_min: session.duration_estimate_min,
        intensity: session.intensity,
        strength_instance_id: session.session_type === "strength" && strengthInstanceId ? strengthInstanceId : null,
        strength_day_number: session.strength_day_number || null,
        running_session_data: null,
        source: source || "preset",
        status: "planned",
        generated_from_preset_id: presetId || null
      };

      // Resolve running session data if available
      if (session.session_type === "running" && planData) {
        const runData = resolveRunningSession(planData, week, session.running_session_type);
        if (runData) {
          row.running_session_data = runData;
        }
      }

      rows.push(row);
    }
  }

  return rows;
}

exports.handler = async (event) => {
  const config = getConfig();
  const auth = await requireAuthenticatedUser(event, config);
  if (auth.error) return auth.error;

  try {
    const qs = event.queryStringParameters || {};

    // ── GET: list athlete weekly plan ──
    if (event.httpMethod === "GET") {
      const assignmentId = qs.assignmentId || qs.programAssignmentId;
      let athleteId = qs.athleteId;

      // If no athleteId provided, use authenticated user's athlete record
      if (!athleteId) {
        const athlete = await getAthleteByIdentity(config, auth.user.sub);
        if (athlete) athleteId = athlete.id;
      }

      if (!athleteId) {
        return json(400, { error: "athleteId is required" });
      }

      const weekNumber = qs.weekNumber != null ? Number(qs.weekNumber) : undefined;
      let plan = await listAthleteWeeklyPlan(config, {
        athleteId,
        programAssignmentId: assignmentId || undefined,
        weekNumber: Number.isInteger(weekNumber) ? weekNumber : undefined
      });

      // Optional filter by instanceId (strength_instance_id)
      const instanceId = qs.instanceId;
      if (instanceId && Array.isArray(plan)) {
        plan = plan.filter(
          (r) => r.strength_instance_id === instanceId || r.session_type !== "strength"
        );
      }

      return json(200, { plan: plan || [] });
    }

    // ── POST: generate weekly plan from preset ──
    if (event.httpMethod === "POST") {
      const body = parseJsonBody(event);

      const assignmentId = (body.assignment_id || body.program_assignment_id || "").toString().trim();
      if (!assignmentId) {
        return json(400, { error: "assignment_id is required" });
      }

      const presetId = (body.preset_id || "").toString().trim();
      if (!presetId) {
        return json(400, { error: "preset_id is required" });
      }

      // Load assignment
      const assignment = await getProgramAssignmentById(config, assignmentId);
      if (!assignment) {
        return json(404, { error: "Assignment not found" });
      }

      // Verify authorized: coach or own athlete
      const roles = Array.isArray(auth.roles) ? auth.roles : [];
      const isCoachOrAdmin = roles.includes("coach") || roles.includes("admin");
      if (!isCoachOrAdmin) {
        const athlete = await getAthleteByIdentity(config, auth.user.sub);
        if (!athlete || athlete.id !== assignment.athlete_id) {
          return json(403, { error: "Forbidden" });
        }
      }

      // Load preset and its slots
      const preset = await getProgramSchedulePresetById(config, presetId);
      if (!preset) {
        return json(404, { error: "Preset not found" });
      }

      const slots = await listProgramScheduleSlots(config, presetId);
      if (!slots || slots.length === 0) {
        return json(400, { error: "Preset has no slots configured" });
      }

      // Load sessions for the program
      const sessions = await listProgramWeeklySessions(config, assignment.training_program_id);
      if (!sessions || sessions.length === 0) {
        return json(400, { error: "Program has no sessions defined" });
      }

      // Find active strength instance for this athlete + program
      let strengthInstanceId = null;
      const instances = await listStrengthPlanInstances(config, {
        athleteId: assignment.athlete_id,
        status: "active"
      });
      if (Array.isArray(instances)) {
        const match = instances.find((inst) => {
          const tpId = inst?.plan?.training_program_id || null;
          return tpId && tpId === assignment.training_program_id;
        });
        if (match) strengthInstanceId = match.id;
      }

      const totalWeeks = assignment.duration_weeks || 12;
      const startDate = assignment.start_date || new Date().toISOString().slice(0, 10);

      const source = body.source || (isCoachOrAdmin ? "preset" : "athlete_setup");
      const fromWeek = body.from_week != null ? Number(body.from_week) : null;
      const effectiveStartWeek = fromWeek && Number.isInteger(fromWeek) && fromWeek > 0 ? fromWeek : 1;

      const planRows = generateWeeklyPlanRows({
        athleteId: assignment.athlete_id,
        assignmentId: assignment.id,
        totalWeeks,
        startDate,
        slots,
        sessions,
        strengthInstanceId,
        planData: assignment.plan_data || null,
        source,
        presetId,
        fromWeek: effectiveStartWeek
      });

      // Delete existing plan: full or partial (from_week onwards)
      if (effectiveStartWeek > 1) {
        await deleteAthleteWeeklyPlanFromWeek(config, assignmentId, effectiveStartWeek);
      } else {
        await deleteAthleteWeeklyPlan(config, assignmentId);
      }

      // Insert new plan rows in batches of 200
      const inserted = [];
      for (let i = 0; i < planRows.length; i += 200) {
        const batch = planRows.slice(i, i + 200);
        const result = await insertAthleteWeeklyPlanRows(config, batch);
        if (Array.isArray(result)) inserted.push(...result);
      }

      // Persist preset linkage on the strength instance
      if (strengthInstanceId) {
        try {
          await updateStrengthPlanInstance(config, strengthInstanceId, {
            schedule_preset_id: presetId,
            preset_assigned_at: new Date().toISOString()
          });
        } catch (_err) {
          // Non-fatal: calendar was generated, just linkage metadata failed
        }
      }

      return json(201, {
        generated: inserted.length,
        totalWeeks,
        presetName: preset.preset_name,
        slotsPerWeek: slots.length
      });
    }

    // ── PATCH: update individual plan row (coach override or status change) ──
    if (event.httpMethod === "PATCH") {
      const body = parseJsonBody(event);
      const rowId = (body.id || body.row_id || "").toString().trim();
      if (!rowId) {
        return json(400, { error: "id (row_id) is required" });
      }

      const patch = {};
      if (body.status != null) {
        const validStatuses = ["planned", "completed", "skipped", "moved"];
        if (!validStatuses.includes(body.status)) {
          return json(400, { error: `status must be one of: ${validStatuses.join(", ")}` });
        }
        patch.status = body.status;
      }
      if (body.coach_notes !== undefined) {
        patch.coach_notes = body.coach_notes || null;
      }
      if (body.session_label != null) patch.session_label = body.session_label;
      if (body.duration_estimate_min !== undefined) patch.duration_estimate_min = body.duration_estimate_min;
      if (body.intensity !== undefined) patch.intensity = body.intensity;

      // Mark as coach override if coach is making changes
      const roles = Array.isArray(auth.roles) ? auth.roles : [];
      if (roles.includes("coach") || roles.includes("admin")) {
        if (body.source != null) {
          patch.source = body.source;
        } else if (Object.keys(patch).length > 0 && !patch.status) {
          patch.source = "coach_override";
        }
      }

      if (Object.keys(patch).length === 0) {
        return json(400, { error: "No valid fields to update" });
      }

      const updated = await updateAthleteWeeklyPlanRow(config, rowId, patch);
      return json(200, { row: updated });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal server error" });
  }
};
