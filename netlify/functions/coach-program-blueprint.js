/**
 * GET /coach-program-blueprint?programId=<uuid>
 *
 * Returns a unified ProgramBlueprint view-model that aggregates
 * training_programs, program_variants, program_schedule_presets,
 * program_schedule_slots and program_weekly_sessions into one payload.
 *
 * Also supports GET without programId to list all programs as lightweight summaries.
 */
const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listTrainingPrograms } = require("./_lib/supabase");
const { composeProgramBlueprint } = require("./_lib/view-models");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "coach");
    if (auth.error) return auth.error;

    const qs = event.queryStringParameters || {};
    const programId = (qs.programId || "").toString().trim();

    // If no programId, return a lightweight list
    if (!programId) {
      const programs = await listTrainingPrograms(config);
      const list = (programs || []).map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        billing_type: p.billing_type,
        duration_weeks: p.duration_weeks,
        classification: p.classification || null,
        default_variant_id: p.default_variant_id || null,
      }));
      return json(200, { programs: list });
    }

    const blueprint = await composeProgramBlueprint(config, programId);
    if (!blueprint) {
      return json(404, { error: "Program not found" });
    }

    return json(200, { blueprint });
  } catch (err) {
    console.error("[coach-program-blueprint]", err);
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal error" });
  }
};
