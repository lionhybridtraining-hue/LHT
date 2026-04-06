const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");
const { upsertAthleteByIdentity, upsertCentralLead } = require("./_lib/supabase");

/**
 * Saves generated running-plan metadata directly on athletes.
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
    const now = new Date().toISOString();
    const athlete = await upsertAthleteByIdentity(config, {
      identityId,
      email: user.email || "",
      name: toOptionalString(plan_params.athlete_name)
    });
    const athleteId = athlete.id;

    // Running plans are saved on athletes (program_assignments no longer stores plan_data).

    const existingOnboarding = await getExistingOnboarding(config, identityId);
    const mergedAnswers = {
      ...(existingOnboarding && existingOnboarding.onboarding_answers ? existingOnboarding.onboarding_answers : {}),
      plan_generation: {
        plan_data,
        plan_params,
        storage: "athletes",
        saved_at: new Date().toISOString()
      }
    };

    const fallbackName = toOptionalString(plan_params.athlete_name);
    const hasCompletedOnboardingForm = hasTruthyValue(
      existingOnboarding &&
      existingOnboarding.onboarding_answers &&
      existingOnboarding.onboarding_answers.planocorrida_landing &&
      existingOnboarding.onboarding_answers.planocorrida_landing.formCompleted
    );
    const resolvedFunnelStage = hasCompletedOnboardingForm
      ? "plan_generated"
      : inferLeadStageFromAnswers(existingOnboarding);
    const resolvedLeadStatus =
      resolvedFunnelStage === "plan_generated" || resolvedFunnelStage === "onboarding_submitted"
        ? "qualified"
        : "new";

    await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `athletes?id=eq.${encodeURIComponent(athleteId)}`,
      method: "PATCH",
      prefer: "return=representation",
      body: {
        ...(fallbackName ? { name: fallbackName } : {}),
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
        funnel_stage: resolvedFunnelStage,
        plan_generated_at: hasCompletedOnboardingForm
          ? now
          : (existingOnboarding ? existingOnboarding.plan_generated_at || null : null),
        plan_storage: "athletes",
        onboarding_answers: mergedAnswers,
        onboarding_submitted_at:
          (existingOnboarding && existingOnboarding.onboarding_submitted_at) || (hasCompletedOnboardingForm ? now : null),
        onboarding_updated_at: now
      }
    });

    await upsertCentralLead(config, {
      athleteId,
      identityId,
      source: "planocorrida_generated",
      email: user.email || "",
      phone: existingOnboarding ? existingOnboarding.phone || null : null,
      fullName:
        fallbackName ||
        (existingOnboarding ? existingOnboarding.name || null : null),
      funnelStage: resolvedFunnelStage,
      leadStatus: resolvedLeadStatus,
      lastActivityAt: now,
      lastActivityType: hasCompletedOnboardingForm ? "plan_generated" : "plan_saved_pending_form",
      profile: {
        storage: "athletes",
        programDistance: plan_params.program_distance ?? null,
        trainingFrequency: plan_params.training_frequency ?? null,
        progressionRate: plan_params.progression_rate ?? null,
        phaseDuration: plan_params.phase_duration ?? null,
        initialVolume: plan_params.initial_volume ?? null,
        hasPlanData: true,
        hasCompletedOnboardingForm
      },
      rawPayload: {
        storage: "athletes",
        savedAt: now,
        resolvedFunnelStage
      }
    });

    return json(200, {
      success: true,
      message: "Plan saved successfully",
      storage: "athletes",
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
    path: `athletes?identity_id=eq.${encodeURIComponent(identityId)}&select=id,name,phone,goal_distance,weekly_frequency,experience_level,consistency_level,onboarding_answers,onboarding_submitted_at,plan_generated_at&limit=1`
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

function hasTruthyValue(value) {
  if (value === true) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  if (typeof value === "number") return value === 1;
  return false;
}

function inferLeadStageFromAnswers(existingOnboarding) {
  const answers = existingOnboarding && existingOnboarding.onboarding_answers && typeof existingOnboarding.onboarding_answers === "object"
    ? existingOnboarding.onboarding_answers
    : {};
  const landing = answers.planocorrida_landing && typeof answers.planocorrida_landing === "object"
    ? answers.planocorrida_landing
    : {};

  const formCompleted = hasTruthyValue(landing.formCompleted);
  const hasLandingData = [
    landing.name,
    landing.phone,
    landing.goalDistance,
    landing.weeklyFrequency,
    landing.experienceLevel,
    landing.currentConsistency
  ].some((value) => value !== undefined && value !== null && value !== "");

  if (formCompleted) return "onboarding_submitted";
  if (hasLandingData) return "landing_submitted";
  return "landing";
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
