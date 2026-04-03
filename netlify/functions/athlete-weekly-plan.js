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
  getAthleteByIdentity,
  setAssignmentPreset,
  createStrengthPlanInstance,
  getTrainingProgramById
} = require("./_lib/supabase");

const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/**
 * Generates athlete_weekly_plan rows from a preset + assignment data.
 * strengthInstanceMap: Map<strength_plan_id, instance_id>
 */
function generateWeeklyPlanRows({
  athleteId,
  assignmentId,
  totalWeeks,
  startDate,
  slots,
  sessions,
  strengthInstanceMap,
  source,
  presetId,
  fromWeek
}) {
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const rows = [];
  const effectiveFromWeek = fromWeek || 1;

  for (const slot of slots) {
    const week = Number(slot.week_number || 1);
    if (!Number.isInteger(week) || week < effectiveFromWeek || week > totalWeeks) continue;

    const session = sessionMap.get(slot.session_id);
    if (!session) continue;

    // Calculate week_start_date (Monday of the slot's week)
    const weekStartDate = new Date(startDate);
    weekStartDate.setDate(weekStartDate.getDate() + (week - 1) * 7);
    const weekStartStr = weekStartDate.toISOString().slice(0, 10);

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
      strength_instance_id: session.session_type === "strength" && session.strength_plan_id && strengthInstanceMap
        ? (strengthInstanceMap.get(session.strength_plan_id) || null)
        : null,
      strength_day_number: session.strength_day_number || null,
      running_session_data: null,
      source: source || "preset",
      status: "planned",
      generated_from_preset_id: presetId || null
    };

    rows.push(row);
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

      const totalWeeks = assignment.duration_weeks || 12;
      const startDate = assignment.start_date || new Date().toISOString().slice(0, 10);

      const source = body.source || (isCoachOrAdmin ? "preset" : "athlete_setup");
      const fromWeek = body.from_week != null ? Number(body.from_week) : null;
      const effectiveStartWeek = fromWeek && Number.isInteger(fromWeek) && fromWeek > 0 ? fromWeek : 1;

      // Create/find strength instances for each unique strength_plan_id in sessions
      const strengthInstanceMap = new Map();
      const program = await getTrainingProgramById(config, assignment.training_program_id);
      const uniqueStrengthPlanIds = [...new Set(
        sessions
          .filter(s => s.session_type === "strength" && s.strength_plan_id)
          .map(s => s.strength_plan_id)
      )];

      if (uniqueStrengthPlanIds.length > 0) {
        const existingInstances = await listStrengthPlanInstances(config, {
          athleteId: assignment.athlete_id,
          status: "active"
        });

        for (const strengthPlanId of uniqueStrengthPlanIds) {
          // Check for existing instance
          const existing = Array.isArray(existingInstances)
            && existingInstances.find(inst => inst.plan_id === strengthPlanId);

          if (existing) {
            strengthInstanceMap.set(strengthPlanId, existing.id);
          } else {
            // Create new instance
            try {
              const instance = await createStrengthPlanInstance(config, {
                plan_id: strengthPlanId,
                athlete_id: assignment.athlete_id,
                start_date: startDate,
                load_round: 2.5,
                status: "active",
                assigned_by: assignment.coach_id,
                program_assignment_id: assignment.id,
                coach_locked_until: null,
                access_model: program ? program.access_model : null,
                plan_snapshot: null
              });
              if (instance && instance.id) {
                strengthInstanceMap.set(strengthPlanId, instance.id);
              }
            } catch (_err) {
              console.error(`Failed to create strength instance for plan ${strengthPlanId}:`, _err.message);
            }
          }
        }
      }

      const planRows = generateWeeklyPlanRows({
        athleteId: assignment.athlete_id,
        assignmentId: assignment.id,
        totalWeeks,
        startDate,
        slots,
        sessions,
        strengthInstanceMap,
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

      // Set selected_preset_id on the assignment
      try {
        await setAssignmentPreset(config, assignmentId, presetId);
      } catch (_err) {
        console.error("Failed to link preset to assignment:", _err.message);
      }

      return json(201, {
        generated: inserted.length,
        totalWeeks,
        presetName: preset.preset_name,
        slotsPerWeek: slots.length,
        instancesCreated: strengthInstanceMap.size
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
