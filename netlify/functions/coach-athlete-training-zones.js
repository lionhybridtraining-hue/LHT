const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  verifyCoachOwnsAthlete,
  listAthleteTrainingZoneProfiles,
  upsertAthleteTrainingZoneProfile,
  replaceAthleteTrainingZones
} = require("./_lib/supabase");

const ALLOWED_MODALITIES = new Set(["general", "run", "bike", "swim", "row", "other"]);
const ALLOWED_METRIC_TYPES = new Set(["heart_rate", "pace"]);
const ALLOWED_MODELS = new Set(["friel_5", "jack_daniels", "percent_hrmax", "hrr", "lthr"]);
const ALLOWED_FAMILIES = new Set(["heart_rate", "performance"]);
const ALLOWED_METHODS = new Set(["fcmax", "hrr", "lthr", "run_vdot", "run_lt_pace"]);

function hasRole(auth, role) {
  return Array.isArray(auth.roles) && auth.roles.includes(role);
}

function asNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validateZones(zones) {
  if (!Array.isArray(zones)) {
    throw new Error("zones must be an array");
  }
  if (zones.length !== 5) {
    throw new Error("zones must contain exactly 5 entries (Z1..Z5)");
  }

  const sorted = [...zones]
    .map((z) => ({
      zone_number: Number(z.zone_number),
      min_value: asNumber(z.min_value),
      max_value: asNumber(z.max_value),
      label: typeof z.label === "string" ? z.label.trim() : null
    }))
    .sort((a, b) => a.zone_number - b.zone_number);

  for (let i = 0; i < sorted.length; i += 1) {
    const row = sorted[i];
    const expectedZone = i + 1;
    if (row.zone_number !== expectedZone) {
      throw new Error("zones must be numbered 1..5");
    }
    if (!Number.isFinite(row.min_value) || !Number.isFinite(row.max_value)) {
      throw new Error(`zone ${expectedZone} requires numeric min_value and max_value`);
    }
    if (row.max_value <= row.min_value) {
      throw new Error(`zone ${expectedZone} max_value must be greater than min_value`);
    }
    if (i > 0 && row.min_value < sorted[i - 1].max_value) {
      throw new Error(`zone ${expectedZone} overlaps with previous zone`);
    }
  }

  return sorted;
}

function validatePayload(body) {
  const athleteId = (body.athleteId || "").toString().trim();
  const modality = (body.modality || "").toString().trim().toLowerCase();
  const metricType = (body.metricType || "heart_rate").toString().trim().toLowerCase();
  const model = (body.model || "lthr").toString().trim().toLowerCase();
  const family = (body.family || (metricType === "pace" ? "performance" : "heart_rate")).toString().trim().toLowerCase();

  if (!athleteId) throw new Error("athleteId is required");
  if (!ALLOWED_MODALITIES.has(modality)) throw new Error("invalid modality");
  if (!ALLOWED_METRIC_TYPES.has(metricType)) throw new Error("invalid metricType");
  if (!ALLOWED_MODELS.has(model)) throw new Error("invalid model");
  if (!ALLOWED_FAMILIES.has(family)) throw new Error("invalid family");

  const parameters = body.parameters && typeof body.parameters === "object" ? body.parameters : {};
  const lthrBpm = asNumber(parameters.lthrBpm);
  const hrMaxBpm = asNumber(parameters.hrMaxBpm);
  const hrRestBpm = asNumber(parameters.hrRestBpm);
  const thresholdPaceSecPerKm = asNumber(parameters.thresholdPaceSecPerKm);
  const vdot = asNumber(parameters.vdot);
  const inferredMethod = metricType === "pace"
    ? (Number.isFinite(vdot) ? "run_vdot" : "run_lt_pace")
    : (model === "percent_hrmax" ? "fcmax" : (model === "hrr" ? "hrr" : "lthr"));
  const method = (body.method || inferredMethod).toString().trim().toLowerCase();

  if (!ALLOWED_METHODS.has(method)) {
    throw new Error("invalid method");
  }

  if (family === "heart_rate") {
    if (metricType !== "heart_rate") {
      throw new Error("heart_rate family requires heart_rate metricType");
    }

    if (method === "fcmax") {
      if (model !== "percent_hrmax") throw new Error("fcmax method requires percent_hrmax model");
      if (!Number.isFinite(hrMaxBpm)) throw new Error("fcmax method requires hrMaxBpm");
    }

    if (method === "hrr") {
      if (model !== "hrr") throw new Error("hrr method requires hrr model");
      if (!Number.isFinite(hrMaxBpm) || !Number.isFinite(hrRestBpm)) {
        throw new Error("hrr method requires hrMaxBpm and hrRestBpm");
      }
      if (hrMaxBpm <= hrRestBpm) {
        throw new Error("hrMaxBpm must be greater than hrRestBpm");
      }
    }

    if (method === "lthr") {
      if (!(model === "lthr" || model === "friel_5")) {
        throw new Error("lthr method requires lthr or friel_5 model");
      }
      if (!Number.isFinite(lthrBpm)) throw new Error("lthr method requires lthrBpm");
    }
  }

  if (family === "performance") {
    if (metricType !== "pace") throw new Error("performance family requires pace metricType");
    if (modality !== "run") throw new Error("performance family is currently only available for run modality");
    if (model !== "jack_daniels") throw new Error("performance family requires jack_daniels model");
    if (!Number.isFinite(thresholdPaceSecPerKm)) throw new Error("performance family requires thresholdPaceSecPerKm");
    if (method === "run_vdot" && !Number.isFinite(vdot)) {
      throw new Error("run_vdot method requires vdot");
    }
    if (!(["run_vdot", "run_lt_pace"].includes(method))) {
      throw new Error("performance family supports run_vdot or run_lt_pace methods");
    }
  }

  if (model === "jack_daniels" && modality !== "run") {
    throw new Error("jack_daniels model is only allowed for run modality");
  }

  const zones = validateZones(body.zones);

  return {
    athleteId,
    modality,
    metricType,
    model,
    family,
    method,
    lthrBpm,
    hrMaxBpm,
    hrRestBpm,
    thresholdPaceSecPerKm,
    vdot,
    zones
  };
}

exports.handler = async (event) => {
  const config = getConfig();
  const auth = await requireAuthenticatedUser(event, config);
  if (auth.error) return auth.error;

  const isAdmin = hasRole(auth, "admin");
  const isCoach = hasRole(auth, "coach");
  if (!isAdmin && !isCoach) return json(403, { error: "Forbidden" });

  try {
    if (event.httpMethod === "GET") {
      const qs = event.queryStringParameters || {};
      const athleteId = (qs.athleteId || "").toString().trim();
      if (!athleteId) return json(400, { error: "athleteId is required" });

      if (!isAdmin) {
        const owns = await verifyCoachOwnsAthlete(config, auth.user.sub, athleteId);
        if (!owns) return json(403, { error: "Forbidden" });
      }

      const profiles = await listAthleteTrainingZoneProfiles(config, athleteId);
      return json(200, { athleteId, profiles });
    }

    if (event.httpMethod === "PUT") {
      const body = parseJsonBody(event);
      const input = validatePayload(body);

      if (!isAdmin) {
        const owns = await verifyCoachOwnsAthlete(config, auth.user.sub, input.athleteId);
        if (!owns) return json(403, { error: "Forbidden" });
      }

      const profile = await upsertAthleteTrainingZoneProfile(config, {
        athlete_id: input.athleteId,
        modality: input.modality,
        metric_type: input.metricType,
        model: input.model,
        lthr_bpm: input.lthrBpm,
        hr_max_bpm: input.hrMaxBpm,
        hr_rest_bpm: input.hrRestBpm,
        threshold_pace_sec_per_km: input.thresholdPaceSecPerKm,
        vdot: input.vdot
      });

      if (!profile || !profile.id) {
        return json(500, { error: "Unable to save zone profile" });
      }

      const zones = await replaceAthleteTrainingZones(config, profile.id, input.zones);
      return json(200, { athleteId: input.athleteId, profile: { ...profile, zones } });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const message = err && err.message ? err.message : "Internal server error";
    return json(err.status || 500, { error: message });
  }
};
