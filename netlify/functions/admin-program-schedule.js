const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole, requireAuthenticatedUser } = require("./_lib/authz");
const { randomUUID } = require("crypto");
const {
  listProgramSchedulePresets,
  getProgramSchedulePresetById,
  createProgramSchedulePreset,
  updateProgramSchedulePreset,
  deleteProgramSchedulePreset,
  listProgramScheduleSlots,
  upsertProgramScheduleSlots,
  deleteProgramScheduleSlots,
  listProgramWeeklySessions,
  getTrainingProgramById,
  getAthleteByIdentity,
  getActiveAssignmentsForAthlete
} = require("./_lib/supabase");

function validatePreset(body) {
  const trainingProgramId = (body.training_program_id || "").toString().trim();
  if (!trainingProgramId) {
    throw Object.assign(new Error("training_program_id is required"), { status: 400 });
  }

  const presetName = (body.preset_name || "").toString().trim();
  if (!presetName) {
    throw Object.assign(new Error("preset_name is required"), { status: 400 });
  }

  const totalTrainingDays = Number(body.total_training_days);
  if (!Number.isInteger(totalTrainingDays) || totalTrainingDays < 1 || totalTrainingDays > 7) {
    throw Object.assign(new Error("total_training_days must be 1-7"), { status: 400 });
  }

  return {
    training_program_id: trainingProgramId,
    preset_name: presetName,
    description: body.description ? body.description.toString().trim() : null,
    total_training_days: totalTrainingDays,
    is_default: body.is_default === true || body.is_default === "true",
    sort_order: Number.isInteger(Number(body.sort_order)) ? Number(body.sort_order) : 0
  };
}

function validateSlot(entry, index, sessionIdSet) {
  if (!entry || typeof entry !== "object") {
    throw Object.assign(new Error(`slots[${index}] must be an object`), { status: 400 });
  }

  const dayOfWeek = Number(entry.day_of_week);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw Object.assign(new Error(`slots[${index}].day_of_week must be 0-6`), { status: 400 });
  }

  const timeSlot = entry.time_slot == null ? 1 : Number(entry.time_slot);
  if (!Number.isInteger(timeSlot) || timeSlot < 1) {
    throw Object.assign(new Error(`slots[${index}].time_slot must be an integer >= 1`), { status: 400 });
  }

  const sessionId = (entry.session_id || "").toString().trim();
  if (!sessionId) {
    throw Object.assign(new Error(`slots[${index}].session_id is required`), { status: 400 });
  }
  if (!sessionIdSet.has(sessionId)) {
    throw Object.assign(new Error(`slots[${index}].session_id does not belong to this program`), { status: 400 });
  }

  const weekNumber = entry.week_number == null ? 1 : Number(entry.week_number);
  if (!Number.isInteger(weekNumber) || weekNumber < 1) {
    throw Object.assign(new Error(`slots[${index}].week_number must be an integer >= 1`), { status: 400 });
  }

  return {
    id: entry.id || randomUUID(),
    day_of_week: dayOfWeek,
    time_slot: timeSlot,
    session_id: sessionId,
    week_number: weekNumber,
    sort_order: Number.isInteger(Number(entry.sort_order)) ? Number(entry.sort_order) : index
  };
}

async function athleteHasProgramAccess(config, identityId, trainingProgramId) {
  const athlete = await getAthleteByIdentity(config, identityId);
  if (!athlete) return false;
  const assignments = await getActiveAssignmentsForAthlete(config, athlete.id);
  return (assignments || []).some((a) => a.training_program_id === trainingProgramId);
}

exports.handler = async (event) => {
  const config = getConfig();

  try {
    const qs = event.queryStringParameters || {};

    if (event.httpMethod === "GET") {
      const auth = await requireAuthenticatedUser(event, config);
      if (auth.error) return auth.error;

      const isCoachOrAdmin = auth.roles.includes("coach") || auth.roles.includes("admin");

      if (qs.presetId) {
        const preset = await getProgramSchedulePresetById(config, qs.presetId);
        if (!preset) return json(404, { error: "Preset not found" });

        if (!isCoachOrAdmin) {
          const hasAccess = await athleteHasProgramAccess(config, auth.user.sub, preset.training_program_id);
          if (!hasAccess) return json(403, { error: "Forbidden" });
        }

        const slots = await listProgramScheduleSlots(config, qs.presetId);
        return json(200, { preset, slots: slots || [] });
      }

      const trainingProgramId = qs.trainingProgramId;
      if (!trainingProgramId) {
        return json(400, { error: "trainingProgramId or presetId query param is required" });
      }

      if (!isCoachOrAdmin) {
        const hasAccess = await athleteHasProgramAccess(config, auth.user.sub, trainingProgramId);
        if (!hasAccess) return json(403, { error: "Forbidden" });
      }

      const presets = await listProgramSchedulePresets(config, trainingProgramId);
      if (qs.includeSlots === "1") {
        const presetsWithSlots = [];
        for (const preset of (presets || [])) {
          const slots = await listProgramScheduleSlots(config, preset.id);
          presetsWithSlots.push({ ...preset, slots: slots || [] });
        }
        return json(200, { presets: presetsWithSlots });
      }

      return json(200, { presets: presets || [] });
    }

    if (event.httpMethod === "POST") {
      const auth = await requireRole(event, config, "coach");
      if (auth.error) return auth.error;

      const body = parseJsonBody(event);
      const validated = validatePreset(body);

      const program = await getTrainingProgramById(config, validated.training_program_id);
      if (!program) return json(404, { error: "Program not found" });

      const preset = await createProgramSchedulePreset(config, validated);
      if (!preset) return json(500, { error: "Failed to create preset" });

      let slots = [];
      if (body.slots && body.slots.length > 0) {
        const sessions = await listProgramWeeklySessions(config, validated.training_program_id);
        const sessionIdSet = new Set((sessions || []).map((s) => s.id));
        const validatedSlots = body.slots.map((s, i) => {
          const vs = validateSlot(s, i, sessionIdSet);
          vs.preset_id = preset.id;
          return vs;
        });
        slots = await upsertProgramScheduleSlots(config, validatedSlots) || [];
      }

      return json(201, { preset, slots });
    }

    if (event.httpMethod === "PUT") {
      const auth = await requireRole(event, config, "coach");
      if (auth.error) return auth.error;

      const body = parseJsonBody(event);
      const presetId = (body.preset_id || body.id || "").toString().trim();
      if (!presetId) return json(400, { error: "preset_id is required" });

      const existing = await getProgramSchedulePresetById(config, presetId);
      if (!existing) return json(404, { error: "Preset not found" });

      const patch = {};
      if (body.preset_name != null) patch.preset_name = body.preset_name.toString().trim();
      if (body.description !== undefined) patch.description = body.description ? body.description.toString().trim() : null;
      if (body.total_training_days != null) {
        const ttd = Number(body.total_training_days);
        if (!Number.isInteger(ttd) || ttd < 1 || ttd > 7) {
          return json(400, { error: "total_training_days must be 1-7" });
        }
        patch.total_training_days = ttd;
      }
      if (body.is_default != null) patch.is_default = body.is_default === true || body.is_default === "true";
      if (body.sort_order != null) patch.sort_order = Number(body.sort_order);

      let preset = existing;
      if (Object.keys(patch).length > 0) {
        preset = await updateProgramSchedulePreset(config, presetId, patch) || existing;
      }

      let slots = [];
      if (body.slots != null) {
        const sessions = await listProgramWeeklySessions(config, existing.training_program_id);
        const sessionIdSet = new Set((sessions || []).map((s) => s.id));

        if (body.slots.length > 0) {
          const validatedSlots = body.slots.map((s, i) => {
            const vs = validateSlot(s, i, sessionIdSet);
            vs.preset_id = presetId;
            return vs;
          });

          if ((body.action || "").toString().trim() === "partial") {
            slots = await upsertProgramScheduleSlots(config, validatedSlots) || [];
          } else {
            await deleteProgramScheduleSlots(config, presetId);
            slots = await upsertProgramScheduleSlots(config, validatedSlots) || [];
          }
        } else if ((body.action || "").toString().trim() !== "partial") {
          await deleteProgramScheduleSlots(config, presetId);
        }
      } else {
        slots = await listProgramScheduleSlots(config, presetId) || [];
      }

      return json(200, { preset, slots });
    }

    if (event.httpMethod === "DELETE") {
      const auth = await requireRole(event, config, "coach");
      if (auth.error) return auth.error;

      const presetId = qs.presetId || (parseJsonBody(event).preset_id || "").toString().trim();
      if (!presetId) return json(400, { error: "presetId is required" });

      const existing = await getProgramSchedulePresetById(config, presetId);
      if (!existing) return json(404, { error: "Preset not found" });

      await deleteProgramSchedulePreset(config, presetId);
      return json(200, { deleted: true });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal server error" });
  }
};
