const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");

async function supabaseRequest({ url, serviceRoleKey, path, method = "GET", body, prefer }) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: prefer || "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message = payload && payload.message ? payload.message : `Supabase error ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function getExistingByIdentity(config, identityId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `onboarding_intake?identity_id=eq.${encodeURIComponent(identityId)}&select=id,identity_id,email,phone,full_name,goal_distance,weekly_frequency,experience_level,consistency_level,funnel_stage,plan_generated_at,plan_storage,answers,submitted_at,updated_at&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function extractStructuredFromAnswers(answers) {
  const root = asObject(answers);
  const landing = asObject(root.planocorrida_landing);
  const planGeneration = asObject(root.plan_generation);

  const goalDistance = Number(landing.goalDistance);
  const weeklyFrequency = Number(landing.weeklyFrequency);

  return {
    phone: normalizePhone(landing.phone),
    full_name: toOptionalString(landing.name),
    goal_distance: Number.isFinite(goalDistance) ? goalDistance : null,
    weekly_frequency: Number.isFinite(weeklyFrequency) ? weeklyFrequency : null,
    experience_level: toOptionalString(landing.experienceLevel),
    consistency_level: toOptionalString(landing.currentConsistency),
    funnel_stage: planGeneration.plan_data ? "plan_generated" : "landing",
    plan_generated_at: planGeneration.plan_data ? new Date().toISOString() : null,
    plan_storage:
      planGeneration && planGeneration.storage && typeof planGeneration.storage === "string"
        ? planGeneration.storage
        : null,
  };
}

function toOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizePhone(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.replace(/(?!^)\+/g, "").replace(/[^\d+\s-]/g, "").trim();
  return trimmed || null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);
    if (!user || !user.id || !user.email) {
      return json(401, { error: "Authentication required" });
    }

    if (event.httpMethod === "GET") {
      const existing = await getExistingByIdentity(config, user.id);
      return json(200, {
        ok: true,
        profile: existing
          ? {
              phone: existing.phone || null,
              fullName: existing.full_name || null,
              goalDistance: existing.goal_distance,
              weeklyFrequency: existing.weekly_frequency,
              experienceLevel: existing.experience_level || null,
              consistencyLevel: existing.consistency_level || null,
              funnelStage: existing.funnel_stage || null,
              planGeneratedAt: existing.plan_generated_at || null,
              planStorage: existing.plan_storage || null,
            }
          : null,
        answers: existing && existing.answers ? existing.answers : {},
        submittedAt: existing ? existing.submitted_at : null,
        updatedAt: existing ? existing.updated_at : null
      });
    }

    const payload = parseJsonBody(event);
    const answers = payload.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return json(400, { error: "Invalid answers payload" });
    }

    const structured = extractStructuredFromAnswers(answers);

    const row = {
      identity_id: user.id,
      email: user.email,
      phone: structured.phone,
      full_name: structured.full_name,
      goal_distance: structured.goal_distance,
      weekly_frequency: structured.weekly_frequency,
      experience_level: structured.experience_level,
      consistency_level: structured.consistency_level,
      funnel_stage: structured.funnel_stage,
      plan_generated_at: structured.plan_generated_at,
      plan_storage: structured.plan_storage,
      answers,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const upserted = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: "onboarding_intake?on_conflict=identity_id",
      method: "POST",
      body: [row],
      prefer: "resolution=merge-duplicates,return=representation"
    });

    const record = Array.isArray(upserted) ? upserted[0] || null : null;

    return json(200, {
      ok: true,
      submittedAt: record ? record.submitted_at : row.submitted_at
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao guardar onboarding" });
  }
};
