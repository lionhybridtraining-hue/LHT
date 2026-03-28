const { requireAuthenticatedUser } = require("./_lib/authz");
const { getConfig } = require("./_lib/config");
const { json } = require("./_lib/http");
const {
  getAthleteByIdentity,
  getOnboardingIntakeByIdentity,
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

    const [assignmentRows, onboardingIntake] = await Promise.all([
      getLatestRunningAssignment(config, athlete.id),
      getOnboardingIntakeByIdentity(config, identityId),
    ]);

    const runningPrograms = [];

    if (Array.isArray(assignmentRows) && assignmentRows.length > 0) {
      const assignment = assignmentRows[0];
      runningPrograms.push({
        id: `assignment:${assignment.id}`,
        status: mapAssignmentStatus(assignment.status),
        storage: "program_assignments",
        generatedAt: assignment.plan_generated_at || null,
        updatedAt: assignment.updated_at || null,
        programDistanceKm: readNumber(assignment.plan_params, "program_distance"),
        trainingFrequency: readNumber(assignment.plan_params, "training_frequency"),
      });
    } else {
      const onboardingPlan = readOnboardingPlan(onboardingIntake);
      if (onboardingPlan) {
        runningPrograms.push({
          id: `onboarding:${onboardingIntake.id}`,
          status: "active",
          storage: "onboarding_intake",
          generatedAt: onboardingPlan.savedAt || onboardingIntake.plan_generated_at || null,
          updatedAt: onboardingIntake.submitted_at || null,
          programDistanceKm: readNumber(onboardingPlan.planParams, "program_distance"),
          trainingFrequency: readNumber(onboardingPlan.planParams, "training_frequency"),
        });
      }
    }

    return json(200, { runningPrograms });
  } catch (error) {
    console.error("[athlete-running-programs] Unexpected error:", error);
    return json(500, { error: "Internal server error" });
  }
};

function mapAssignmentStatus(status) {
  if (status === "active") return "active";
  if (status === "scheduled" || status === "paused") return "pending";
  return "none";
}

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

async function getLatestRunningAssignment(config, athleteId) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_assignments?athlete_id=eq.${encodeURIComponent(athleteId)}&plan_generated_at=not.is.null&select=id,status,plan_generated_at,plan_params,updated_at&order=plan_generated_at.desc.nullslast,updated_at.desc&limit=1`,
  });
}

async function supabaseRequest({ url, serviceRoleKey, path, method = "GET", body, prefer }) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: prefer || "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_error) {
    payload = text;
  }

  if (!response.ok) {
    const message = payload && payload.message ? payload.message : `Supabase error ${response.status}`;
    throw new Error(message);
  }

  return payload;
}
