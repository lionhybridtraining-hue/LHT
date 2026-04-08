const { requireAuthenticatedUser } = require("./_lib/authz");
const { getConfig } = require("./_lib/config");
const { json } = require("./_lib/http");
const {
  getAthleteByIdentity,
  getOnboardingIntakeByIdentity,
  upsertCentralLead,
} = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const identityId = auth.user.sub;
    const athlete = await getAthleteByIdentity(config, identityId);
    if (!athlete) {
      return json(403, { error: "No athlete profile found for this account" });
    }

    const onboardingIntake = await getOnboardingIntakeByIdentity(config, identityId);

    const runningPrograms = [];

    const onboardingPlan = readOnboardingPlan(onboardingIntake);
    if (onboardingPlan) {
      runningPrograms.push({
        id: `onboarding:${onboardingIntake.id}`,
        status: "active",
        storage: "athletes",
        generatedAt: onboardingPlan.savedAt || onboardingIntake.plan_generated_at || null,
        updatedAt: onboardingIntake.submitted_at || null,
        programDistanceKm: readNumber(onboardingPlan.planParams, "program_distance"),
        trainingFrequency: readNumber(onboardingPlan.planParams, "training_frequency"),
        hasPlanData: Boolean(onboardingPlan.planParams),
        source: "onboarding",
        openPath: buildPlanOpenPath(onboardingPlan.planParams),
        regeneratePath: "/atleta/onboarding/formulario",
      });
    }

    try {
      await upsertCentralLead(config, {
        athleteId: athlete.id,
        identityId,
        source: "planocorrida_generated",
        email: athlete.email || auth.user.email || "",
        phone: athlete.phone || null,
        fullName: athlete.name || null,
        funnelStage: onboardingIntake && onboardingIntake.funnel_stage ? onboardingIntake.funnel_stage : "landing",
        leadStatus:
          onboardingIntake && (onboardingIntake.funnel_stage === "onboarding_submitted" || onboardingIntake.funnel_stage === "plan_generated")
            ? "qualified"
            : "new",
        lastActivityAt: new Date().toISOString(),
        lastActivityType: "plan_accessed",
        profile: {
          runningProgramsCount: runningPrograms.length,
          hasOnboardingPlan: Boolean(onboardingPlan),
        },
        rawPayload: {
          endpoint: "athlete-running-programs",
        }
      });
    } catch (leadError) {
      // Lead sync is non-critical for rendering athlete programs.
      console.warn("[athlete-running-programs] upsertCentralLead failed:", leadError && leadError.message ? leadError.message : leadError);
    }

    return json(200, { runningPrograms });
  } catch (error) {
    console.error("[athlete-running-programs] Unexpected error:", error);
    return json(500, { error: "Internal server error" });
  }
};

function readOnboardingPlan(onboardingIntake) {
  if (!onboardingIntake || !onboardingIntake.answers) return null;
  const payload = onboardingIntake.answers.plan_generation;
  if (!payload || typeof payload !== "object") return null;

  return {
    planParams: payload.plan_params || null,
    savedAt: payload.saved_at || null,
  };
}

function readNumber(source, key) {
  if (!source || typeof source !== "object") return null;
  const raw = source[key];
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function buildPlanOpenPath(planParams) {
  if (!planParams || typeof planParams !== "object") {
    return "/atleta/onboarding/formulario";
  }

  const requiredKeys = [
    "progression_rate",
    "phase_duration",
    "training_frequency",
    "program_distance",
  ];

  const params = new URLSearchParams();
  for (const key of requiredKeys) {
    const value = planParams[key];
    if (value === undefined || value === null || value === "") {
      return "/atleta/onboarding/formulario";
    }
    params.set(key, String(value));
  }

  const optionalKeys = ["race_dist", "race_time", "initial_volume"];
  for (const key of optionalKeys) {
    const value = planParams[key];
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  return `/atleta/plano?${params.toString()}`;
}
