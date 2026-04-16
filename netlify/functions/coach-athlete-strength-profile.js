const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { verifyCoachOwnsAthlete, updateAthlete } = require("./_lib/supabase");

const VALID_LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const VALID_MOVEMENT_VARIANTS = new Set(["standard", "lateralized"]);
const VALID_GYM_ACCESS = new Set(["full_gym", "limited_equipment", "no_gym"]);

function normalizeNullableEnum(value, validSet, field) {
  if (value == null || value === "") return null;
  const normalized = value.toString().trim();
  if (!validSet.has(normalized)) {
    throw Object.assign(new Error(`${field} is invalid`), { status: 400 });
  }
  return normalized;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "PATCH") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const roles = Array.isArray(auth.roles) ? auth.roles : [];
    const isAdmin = roles.includes("admin");
    const isCoachOrAdmin = isAdmin || roles.includes("coach");
    if (!isCoachOrAdmin) {
      return json(403, { error: "Forbidden" });
    }

    const body = parseJsonBody(event);
    const athleteId = (body.athlete_id || body.athleteId || "").toString().trim();
    if (!athleteId) {
      return json(400, { error: "athlete_id is required" });
    }

    if (!isAdmin) {
      const owns = await verifyCoachOwnsAthlete(config, auth.user.sub, athleteId);
      if (!owns) {
        return json(403, { error: "Forbidden" });
      }
    }

    const patch = {};
    if (Object.prototype.hasOwnProperty.call(body, "coach_strength_level_override") || Object.prototype.hasOwnProperty.call(body, "coachStrengthLevelOverride")) {
      patch.coach_strength_level_override = normalizeNullableEnum(
        body.coach_strength_level_override ?? body.coachStrengthLevelOverride,
        VALID_LEVELS,
        "coach_strength_level_override"
      );
    }
    if (Object.prototype.hasOwnProperty.call(body, "coach_gym_access_override") || Object.prototype.hasOwnProperty.call(body, "coachGymAccessOverride")) {
      patch.coach_gym_access_override = normalizeNullableEnum(
        body.coach_gym_access_override ?? body.coachGymAccessOverride,
        VALID_GYM_ACCESS,
        "coach_gym_access_override"
      );
    }

    if (!Object.keys(patch).length) {
      return json(400, { error: "No coach override fields provided" });
    }

    const athlete = await updateAthlete(config, athleteId, patch);
    if (!athlete) {
      return json(404, { error: "Athlete not found" });
    }

    return json(200, {
      athlete: {
        id: athlete.id,
        strength_level: athlete.strength_level || null,
        gym_access: athlete.gym_access || "full_gym",
        coach_strength_level_override: athlete.coach_strength_level_override || null,
        coach_gym_access_override: athlete.coach_gym_access_override || null,
        strength_movement_variant: athlete.strength_movement_variant || "standard",
        strength_log_detail: athlete.strength_log_detail || "exercise"
      }
    });
  } catch (err) {
    const status = Number(err && err.status);
    if (status >= 400 && status < 500) {
      return json(status, { error: err.message || "Erro de validacao" });
    }
    console.error("[coach-athlete-strength-profile] Unhandled error:", err && err.message ? err.message : err);
    return json(500, { error: err.message || "Erro ao atualizar perfil de força" });
  }
};