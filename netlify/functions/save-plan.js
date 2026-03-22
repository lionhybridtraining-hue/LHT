const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");
const { upsertAthleteByIdentity } = require("./_lib/supabase");

/**
 * Saves a generated training plan to the active assignment when it exists.
 * Falls back to onboarding_intake for pre-assignment / free-plan users.
 * 
 * Expected POST body:
 * {
 *   plan_data: { phase1: {...}, phase2: {...}, phase3: {...} },
 *   plan_params: {
 *     vdot: number,
 *     level: string,
 *     progression_rate: number,
 *     phase_duration: number,
 *     training_frequency: number,
 *     program_distance: number,
 *     race_dist: number,
 *     race_time: number,
 *     initial_volume?: number,
 *     athlete_name?: string
 *   }
 * }
 */
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);
    
    if (!user) {
      return json(401, { error: "Authentication required" });
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (err) {
      return json(400, { error: "Invalid JSON body" });
    }

    const { plan_data, plan_params } = body;

    if (!plan_data) {
      return json(400, { error: "plan_data is required" });
    }

    if (!plan_params) {
      return json(400, { error: "plan_params is required" });
    }

    const identityId = user.id || user.sub;
    const athlete = await upsertAthleteByIdentity(config, {
      identityId,
      email: user.email || "",
      name: toOptionalString(plan_params.athlete_name)
    });
    const athleteId = athlete.id;

    // Get the active program assignment for this athlete
    const programAssignment = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `program_assignments?athlete_id=eq.${encodeURIComponent(athleteId)}&status=in.("scheduled","active","paused")&select=id&order=created_at.desc&limit=1`
    });

    if (Array.isArray(programAssignment) && programAssignment.length) {
      const assignmentId = programAssignment[0].id;

      await supabaseRequest({
        url: config.supabaseUrl,
        serviceRoleKey: config.supabaseServiceRoleKey,
        path: `program_assignments?id=eq.${encodeURIComponent(assignmentId)}`,
        method: "PATCH",
        body: {
          plan_data: plan_data,
          plan_params: plan_params,
          plan_generated_at: new Date().toISOString()
        }
      });

      return json(200, {
        success: true,
        message: "Plan saved successfully",
        storage: "program_assignments",
        assignment_id: assignmentId,
        plan_params: plan_params
      });
    }

    const existingOnboarding = await getExistingOnboarding(config, identityId);
    const mergedAnswers = {
      ...(existingOnboarding && existingOnboarding.answers ? existingOnboarding.answers : {}),
      plan_generation: {
        plan_data,
        plan_params,
        storage: "onboarding_intake",
        saved_at: new Date().toISOString()
      }
    };

    const fallbackName = toOptionalString(plan_params.athlete_name);

    await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: "onboarding_intake?on_conflict=identity_id",
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: [
        {
          identity_id: identityId,
          athlete_id: athleteId,
          email: user.email || "",
          phone: existingOnboarding ? existingOnboarding.phone || null : null,
          full_name:
            fallbackName ||
            (existingOnboarding ? existingOnboarding.full_name || null : null),
          goal_distance:
            Number.isFinite(Number(plan_params.program_distance))
              ? Number(plan_params.program_distance)
              : (existingOnboarding ? existingOnboarding.goal_distance ?? null : null),
          weekly_frequency:
            Number.isFinite(Number(plan_params.training_frequency))
              ? Number(plan_params.training_frequency)
              : (existingOnboarding ? existingOnboarding.weekly_frequency ?? null : null),
          experience_level:
            (existingOnboarding && existingOnboarding.experience_level) || null,
          consistency_level:
            (existingOnboarding && existingOnboarding.consistency_level) || null,
          funnel_stage: "plan_generated",
          plan_generated_at: new Date().toISOString(),
          plan_storage: "onboarding_intake",
          answers: mergedAnswers,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]
    });

    return json(200, {
      success: true,
      message: "Plan saved successfully",
      storage: "onboarding_intake",
      athlete_id: athleteId,
      identity_id: identityId,
      plan_params: plan_params
    });

  } catch (err) {
    if (err && err.status === 409) {
      return json(409, { error: err.message || "Conflito ao associar atleta" });
    }
    console.error("Error saving plan:", err);
    return json(500, { error: err.message || "Error saving plan" });
  }
};

async function getExistingOnboarding(config, identityId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `onboarding_intake?identity_id=eq.${encodeURIComponent(identityId)}&select=id,athlete_id,answers,phone,full_name,goal_distance,weekly_frequency,experience_level,consistency_level&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function toOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

// Helper function (copied from supabase.js)
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
  } catch (err) {
    payload = text;
  }

  if (!response.ok) {
    const message = payload && payload.message ? payload.message : `Supabase error ${response.status}`;
    throw new Error(message);
  }

  return payload;
}
