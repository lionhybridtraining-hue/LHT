const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole, requireAuthenticatedUser } = require("./_lib/authz");
const {
  getVariantsForProgram,
  filterVariants,
  getVariantById,
  createVariant,
  createVariantsBatch,
  updateVariant,
  deleteVariant,
  setDefaultVariant
} = require("./_lib/supabase");

// ── Validation ─────────────────────────────────────────────

const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"];

function validateVariant(body, index) {
  const prefix = index != null ? `variants[${index}].` : "";

  const trainingProgramId = (body.training_program_id || "").toString().trim();
  if (!trainingProgramId) {
    throw Object.assign(new Error(`${prefix}training_program_id is required`), { status: 400 });
  }

  const durationWeeks = Number(body.duration_weeks);
  if (!Number.isInteger(durationWeeks) || durationWeeks < 1) {
    throw Object.assign(new Error(`${prefix}duration_weeks must be a positive integer`), { status: 400 });
  }

  const experienceLevel = (body.experience_level || "").toString().trim().toLowerCase();
  if (!EXPERIENCE_LEVELS.includes(experienceLevel)) {
    throw Object.assign(new Error(`${prefix}experience_level must be one of: ${EXPERIENCE_LEVELS.join(", ")}`), { status: 400 });
  }

  const weeklyFrequency = Number(body.weekly_frequency);
  if (!Number.isInteger(weeklyFrequency) || weeklyFrequency < 1 || weeklyFrequency > 7) {
    throw Object.assign(new Error(`${prefix}weekly_frequency must be 1-7`), { status: 400 });
  }

  const strengthPlanId = (body.strength_plan_id || "").toString().trim() || null;
  const runningPlanTemplateId = (body.running_plan_template_id || "").toString().trim() || null;

  if (!strengthPlanId && !runningPlanTemplateId) {
    throw Object.assign(new Error(`${prefix}at least one of strength_plan_id or running_plan_template_id is required`), { status: 400 });
  }

  const runningConfigPreset = body.running_config_preset && typeof body.running_config_preset === "object"
    ? body.running_config_preset
    : {};

  return {
    training_program_id: trainingProgramId,
    duration_weeks: durationWeeks,
    experience_level: experienceLevel,
    weekly_frequency: weeklyFrequency,
    strength_plan_id: strengthPlanId,
    running_plan_template_id: runningPlanTemplateId,
    running_config_preset: runningConfigPreset
  };
}

// ── Handler ────────────────────────────────────────────────

exports.handler = async (event) => {
  const config = getConfig();

  try {
    const qs = event.queryStringParameters || {};

    // ── GET: list / filter variants ──────────────────────────
    if (event.httpMethod === "GET") {
      // GET is open to any authenticated user (athletes need to fetch variants for picker)
      const auth = await requireAuthenticatedUser(event, config);
      if (auth.error) return auth.error;

      const programId = qs.program_id || qs.training_program_id;
      if (!programId) {
        return json(400, { error: "program_id query parameter is required" });
      }

      // If filter params present, use filterVariants; otherwise return all
      const hasFilter = qs.experience_level || qs.weekly_frequency || qs.duration_weeks;
      if (hasFilter) {
        const variants = await filterVariants(config, {
          trainingProgramId: programId,
          experienceLevel: qs.experience_level || null,
          weeklyFrequency: qs.weekly_frequency ? Number(qs.weekly_frequency) : null,
          durationWeeks: qs.duration_weeks ? Number(qs.duration_weeks) : null
        });
        return json(200, { program_id: programId, count: variants.length, variants });
      }

      const variants = await getVariantsForProgram(config, programId);
      return json(200, { program_id: programId, count: variants.length, variants });
    }

    // ── POST: create variant(s) ──────────────────────────────
    if (event.httpMethod === "POST") {
      const auth = await requireRole(event, config, "admin");
      if (auth.error) return auth.error;

      const body = parseJsonBody(event);
      if (!body) {
        return json(400, { error: "JSON body required" });
      }

      // Batch creation: POST with { variants: [...] }
      if (Array.isArray(body.variants)) {
        if (body.variants.length === 0) {
          return json(400, { error: "variants array must not be empty" });
        }
        if (body.variants.length > 50) {
          return json(400, { error: "Maximum 50 variants per batch" });
        }

        const validated = body.variants.map((v, i) => validateVariant(v, i));

        // Ensure all belong to same program
        const programIds = [...new Set(validated.map((v) => v.training_program_id))];
        if (programIds.length > 1) {
          return json(400, { error: "All variants in batch must belong to the same program" });
        }

        if (auth.user && auth.user.id) {
          validated.forEach((v) => { v.created_by = auth.user.id; });
        }

        const created = await createVariantsBatch(config, validated);
        return json(201, { created: created.length, variants: created });
      }

      // Single creation: POST with { training_program_id, ... }
      const validated = validateVariant(body);
      if (auth.user && auth.user.id) {
        validated.created_by = auth.user.id;
      }

      const created = await createVariant(config, validated);
      return json(201, created);
    }

    // ── PATCH: update variant ────────────────────────────────
    if (event.httpMethod === "PATCH") {
      const auth = await requireRole(event, config, "admin");
      if (auth.error) return auth.error;

      const variantId = qs.id;
      if (!variantId) {
        return json(400, { error: "id query parameter is required" });
      }

      const body = parseJsonBody(event);
      if (!body) {
        return json(400, { error: "JSON body required" });
      }

      // Build safe patch — only allow specific fields
      const patch = {};
      if ("strength_plan_id" in body) patch.strength_plan_id = body.strength_plan_id || null;
      if ("running_plan_template_id" in body) patch.running_plan_template_id = body.running_plan_template_id || null;
      if (body.running_config_preset && typeof body.running_config_preset === "object") {
        patch.running_config_preset = body.running_config_preset;
      }
      if (body.duration_weeks != null) {
        const dw = Number(body.duration_weeks);
        if (!Number.isInteger(dw) || dw < 1) {
          return json(400, { error: "duration_weeks must be a positive integer" });
        }
        patch.duration_weeks = dw;
      }
      if (body.experience_level) {
        if (!EXPERIENCE_LEVELS.includes(body.experience_level)) {
          return json(400, { error: `experience_level must be one of: ${EXPERIENCE_LEVELS.join(", ")}` });
        }
        patch.experience_level = body.experience_level;
      }
      if (body.weekly_frequency != null) {
        const wf = Number(body.weekly_frequency);
        if (!Number.isInteger(wf) || wf < 1 || wf > 7) {
          return json(400, { error: "weekly_frequency must be 1-7" });
        }
        patch.weekly_frequency = wf;
      }

      if (Object.keys(patch).length === 0) {
        return json(400, { error: "No valid fields to update" });
      }

      const updated = await updateVariant(config, variantId, patch);
      if (!updated) {
        return json(404, { error: "Variant not found" });
      }
      return json(200, updated);
    }

    // ── DELETE: remove variant ────────────────────────────────
    if (event.httpMethod === "DELETE") {
      const auth = await requireRole(event, config, "admin");
      if (auth.error) return auth.error;

      const variantId = qs.id;
      if (!variantId) {
        return json(400, { error: "id query parameter is required" });
      }

      // Special: set-default action
      if (qs.action === "set-default") {
        const programId = qs.program_id;
        if (!programId) {
          return json(400, { error: "program_id required for set-default action" });
        }
        const program = await setDefaultVariant(config, programId, variantId);
        return json(200, { default_variant_id: variantId, program });
      }

      const count = await deleteVariant(config, variantId);
      if (count === 0) {
        return json(404, { error: "Variant not found" });
      }
      return json(200, { deleted: true, id: variantId });
    }

    // ── PUT: set default variant (cleaner API surface) ───────
    if (event.httpMethod === "PUT") {
      const auth = await requireRole(event, config, "admin");
      if (auth.error) return auth.error;

      const body = parseJsonBody(event);
      if (!body || !body.program_id || !body.variant_id) {
        return json(400, { error: "program_id and variant_id are required" });
      }

      const program = await setDefaultVariant(config, body.program_id, body.variant_id);
      return json(200, { default_variant_id: body.variant_id, program });
    }

    return json(405, { error: "Method not allowed" });

  } catch (err) {
    return json(err.status || 500, { error: err.message });
  }
};
