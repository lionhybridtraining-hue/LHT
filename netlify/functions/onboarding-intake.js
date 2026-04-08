const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");
const { getProgramAccess } = require("./_lib/program-access");
const { upsertAthleteByIdentity, upsertCentralLead } = require("./_lib/supabase");

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
    path: `athletes?identity_id=eq.${encodeURIComponent(identityId)}&select=id,identity_id,email,name,phone,goal_distance,weekly_frequency,experience_level,consistency_level,funnel_stage,plan_generated_at,plan_storage,onboarding_answers,onboarding_submitted_at,onboarding_updated_at&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function toOptionalString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizePhone(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/(?!^)\+/g, "").replace(/[^\d+\s-]/g, "").trim();
  return trimmed || null;
}

function pickFirstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function pickFirstNonNull(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
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

function normalizeCanonicalExperienceLevel(value) {
  const normalized = toOptionalString(value);
  if (!normalized) return null;

  const key = normalized.toLowerCase();
  const map = {
    starter: "starter",
    iniciante: "starter",
    beginner: "starter",
    building: "building",
    intermedio: "building",
    intermediate: "building",
    performance: "performance",
    avancado: "performance",
    advanced: "performance"
  };

  return map[key] || null;
}

function normalizeCanonicalConsistencyLevel(value) {
  const normalized = toOptionalString(value);
  if (!normalized) return null;

  const key = normalized.toLowerCase();
  const map = {
    low: "low",
    baixo: "low",
    medium: "medium",
    medio: "medium",
    high: "high",
    alto: "high"
  };

  return map[key] || null;
}

function mergeFunnelStage(existingStage, incomingStage) {
  const rank = {
    landing: 0,
    landing_submitted: 1,
    meta_received: 1,
    onboarding_submitted: 2,
    plan_generated: 3,
    app_installed: 4,
    coach_application: 5,
    qualified: 6,
    converted: 7,
    disqualified: 8
  };

  const normalizedExisting = typeof existingStage === "string" ? existingStage : "landing";
  const normalizedIncoming = typeof incomingStage === "string" ? incomingStage : "landing";

  return (rank[normalizedIncoming] || 0) >= (rank[normalizedExisting] || 0)
    ? normalizedIncoming
    : normalizedExisting;
}

function stripDeprecatedAnswerKeys(answers) {
  const clean = { ...answers };
  delete clean.experiencia_ginasio;
  delete clean.tempo_consistencia_treino;
  return clean;
}

function hasMeaningfulLandingAnswers(landing, root) {
  const fields = [
    landing.name,
    landing.phone,
    landing.goalDistance,
    landing.weeklyFrequency,
    landing.experienceLevel,
    landing.currentConsistency,
    root.goal_distance,
    root.goalDistance,
    root.weekly_frequency,
    root.weeklyFrequency,
    root.experience_level,
    root.experienceLevel,
    root.consistency_level,
    root.consistencyLevel,
    root.nome_completo,
    root.full_name,
    root.fullName,
    root.telemovel,
    root.phone
  ];

  return fields.some((value) => value !== undefined && value !== null && value !== "");
}

function extractStructuredFromAnswers(answers) {
  const root = asObject(answers);
  const landing = asObject(root.planocorrida_landing);
  const planGeneration = asObject(root.plan_generation);
  const pwa = asObject(root.pwa);

  const goalDistance = toFiniteNumber(
    pickFirstDefined(
      landing.goalDistance,
      root.goal_distance,
      root.goalDistance,
      root.distancia_objetivo
    )
  );

  const weeklyFrequency = toFiniteNumber(
    pickFirstDefined(
      landing.weeklyFrequency,
      root.weekly_frequency,
      root.weeklyFrequency,
      root.frequencia_semanal
    )
  );

  const hasOnboardingAnswers = [
    root.nome_completo,
    root.telemovel,
    root.data_nascimento,
    root.peso_kg,
    root.profissao,
    root.maior_objetivo
  ].some((value) => value !== undefined && value !== null && value !== "");

  const landingCompleted =
    hasTruthyValue(landing.formCompleted) ||
    hasTruthyValue(root.planocorrida_form_completed) ||
    hasTruthyValue(root.onboarding_form_completed);

  const hasLandingAnswers = hasMeaningfulLandingAnswers(landing, root);
  const canPromoteToPlanGenerated = Boolean(planGeneration.plan_data) && landingCompleted;

  let activityType = "onboarding_submitted";
  if (pwa.installedAt) activityType = "app_installed";
  else if (pwa.installPromptedAt) activityType = "app_install_prompted";
  else if (landing.entryAt && !hasLandingAnswers && !landingCompleted) activityType = "landing_viewed";
  else if (hasLandingAnswers && !landingCompleted) activityType = "landing_submitted";
  else if (canPromoteToPlanGenerated) activityType = "plan_generated";

  return {
    phone: normalizePhone(pickFirstDefined(landing.phone, root.telemovel, root.phone)),
    fullName: toOptionalString(
      pickFirstDefined(landing.name, root.nome_completo, root.full_name, root.fullName)
    ),
    goalDistance: Number.isFinite(goalDistance) ? goalDistance : null,
    weeklyFrequency: Number.isFinite(weeklyFrequency) ? weeklyFrequency : null,
    experienceLevel: normalizeCanonicalExperienceLevel(
      pickFirstDefined(landing.experienceLevel, root.experience_level, root.experienceLevel)
    ),
    consistencyLevel: normalizeCanonicalConsistencyLevel(
      pickFirstDefined(landing.currentConsistency, root.consistency_level, root.consistencyLevel)
    ),
    funnelStage: pwa.installedAt
      ? "app_installed"
      : canPromoteToPlanGenerated
        ? "plan_generated"
        : hasOnboardingAnswers
          ? "onboarding_submitted"
          : landingCompleted
            ? "onboarding_submitted"
            : hasLandingAnswers
              ? "landing_submitted"
              : "landing",
    planGeneratedAt: canPromoteToPlanGenerated ? new Date().toISOString() : null,
    planStorage:
      planGeneration && planGeneration.storage && typeof planGeneration.storage === "string"
        ? planGeneration.storage
        : null,
    hasFormCompletion: landingCompleted,
    activityType
  };
}

function inferLeadSource(answers) {
  const root = asObject(answers);
  if (root.plan_generation || root.planocorrida_landing) return "planocorrida_landing";
  return "onboarding";
}

function inferLeadStatus(funnelStage) {
  if (funnelStage === "plan_generated" || funnelStage === "onboarding_submitted" || funnelStage === "app_installed") return "qualified";
  return "new";
}

async function syncLegacyOnboardingForm(config, payload) {
  const body = {
    identity_id: payload.identityId,
    email: payload.email,
    ...(payload.fullName ? { nome_completo: payload.fullName } : {}),
    ...(payload.phone ? { telemovel: payload.phone } : {}),
    ...(payload.submittedAt ? { submitted_at: payload.submittedAt } : {})
  };

  try {
    await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: "onboarding_form_responses?on_conflict=identity_id",
      method: "POST",
      body,
      prefer: "resolution=merge-duplicates,return=representation"
    });

    return {
      attempted: true,
      synced: true,
      reason: null
    };
  } catch (error) {
    const message = String((error && error.message) || "");
    if (message.includes("onboarding_form_responses") || message.includes("relation")) {
      return {
        attempted: true,
        synced: false,
        reason: "legacy_table_missing"
      };
    }

    return {
      attempted: true,
      synced: false,
      reason: "legacy_sync_failed"
    };
  }
}

function toApiSnapshot(row) {
  if (!row) return null;
  return {
    athleteId: row.id || null,
    phone: row.phone || null,
    fullName: row.name || null,
    goalDistance: row.goal_distance ?? null,
    weeklyFrequency: row.weekly_frequency ?? null,
    experienceLevel: normalizeCanonicalExperienceLevel(row.experience_level),
    consistencyLevel: normalizeCanonicalConsistencyLevel(row.consistency_level),
    funnelStage: row.funnel_stage || null,
    planGeneratedAt: row.plan_generated_at || null,
    planStorage: row.plan_storage || null,
    answers: asObject(row.onboarding_answers),
    submittedAt: row.onboarding_submitted_at || null,
    updatedAt: row.onboarding_updated_at || null
  };
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
      const snapshot = toApiSnapshot(existing);
      return json(200, {
        ok: true,
        profile: snapshot
          ? {
              athleteId: snapshot.athleteId,
              phone: snapshot.phone,
              fullName: snapshot.fullName,
              goalDistance: snapshot.goalDistance,
              weeklyFrequency: snapshot.weeklyFrequency,
              experienceLevel: snapshot.experienceLevel,
              consistencyLevel: snapshot.consistencyLevel,
              funnelStage: snapshot.funnelStage,
              planGeneratedAt: snapshot.planGeneratedAt,
              planStorage: snapshot.planStorage
            }
          : null,
        answers: snapshot ? snapshot.answers : {},
        submittedAt: snapshot ? snapshot.submittedAt : null,
        updatedAt: snapshot ? snapshot.updatedAt : null
      });
    }

    const payload = parseJsonBody(event);
    const answers = payload.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return json(400, { error: "Invalid answers payload" });
    }

    const query = event.queryStringParameters || {};
    const hasProgramParam = !!(query.program_id || query.program || query.program_external_id);

    if (hasProgramParam) {
      const access = await getProgramAccess(config, {
        identityId: user.id,
        programId: query.program_id,
        programExternalId: query.program || query.program_external_id
      });
      if (!access.program) return json(404, { error: "Programa nao encontrado" });
      if (!access.hasAccess) return json(403, { error: "Pagamento necessario para aceder ao onboarding" });
    }

    const existing = await getExistingByIdentity(config, user.id);
    const structured = extractStructuredFromAnswers(answers);
    const now = new Date().toISOString();

    const existingAnswers = existing ? asObject(existing.onboarding_answers) : {};
    const mergedAnswers = stripDeprecatedAnswerKeys({
      ...existingAnswers,
      ...asObject(answers)
    });

    const athlete = await upsertAthleteByIdentity(config, {
      identityId: user.id,
      email: user.email,
      name: pickFirstNonNull(structured.fullName, existing ? existing.name : null, user.email)
    });

    const funnelStage = mergeFunnelStage(existing ? existing.funnel_stage : null, structured.funnelStage);

    const onboardingSubmittedAt =
      existing && existing.onboarding_submitted_at
        ? existing.onboarding_submitted_at
        : structured.hasFormCompletion
          ? now
          : null;

    const patch = {
      name: pickFirstNonNull(structured.fullName, existing ? existing.name : null, athlete.name || user.email),
      phone: pickFirstNonNull(structured.phone, existing ? existing.phone : null),
      goal_distance: pickFirstNonNull(structured.goalDistance, existing ? existing.goal_distance : null),
      weekly_frequency: pickFirstNonNull(structured.weeklyFrequency, existing ? existing.weekly_frequency : null),
      experience_level: pickFirstNonNull(structured.experienceLevel, existing ? existing.experience_level : null),
      consistency_level: pickFirstNonNull(structured.consistencyLevel, existing ? existing.consistency_level : null),
      funnel_stage: funnelStage,
      plan_generated_at: pickFirstNonNull(structured.planGeneratedAt, existing ? existing.plan_generated_at : null),
      plan_storage: pickFirstNonNull(structured.planStorage, existing ? existing.plan_storage : null),
      onboarding_answers: mergedAnswers,
      onboarding_submitted_at: onboardingSubmittedAt,
      onboarding_updated_at: now
    };

    const updatedRows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `athletes?id=eq.${encodeURIComponent(athlete.id)}`,
      method: "PATCH",
      body: patch,
      prefer: "return=representation"
    });

    const updated = Array.isArray(updatedRows) ? updatedRows[0] || null : null;

    const legacySync = await syncLegacyOnboardingForm(config, {
      identityId: user.id,
      email: user.email,
      fullName: patch.name || null,
      phone: patch.phone || null,
      submittedAt: (updated ? updated.onboarding_submitted_at : patch.onboarding_submitted_at) || null
    });

    await upsertCentralLead(config, {
      athleteId: athlete.id,
      identityId: user.id,
      source: inferLeadSource(mergedAnswers),
      email: user.email,
      phone: patch.phone || null,
      fullName: patch.name || null,
      funnelStage,
      leadStatus: inferLeadStatus(funnelStage),
      lastActivityAt: now,
      lastActivityType: structured.activityType,
      profile: {
        goalDistance: patch.goal_distance,
        weeklyFrequency: patch.weekly_frequency,
        experienceLevel: patch.experience_level,
        consistencyLevel: patch.consistency_level,
        hasFormCompletion: structured.hasFormCompletion,
        answersKeys: Object.keys(mergedAnswers).sort()
      },
      rawPayload: {
        athleteId: athlete.id,
        funnelStage,
        activityType: structured.activityType,
        submittedAt: patch.onboarding_submitted_at
      }
    });

    return json(200, {
      ok: true,
      athleteId: athlete.id,
      submittedAt: updated ? updated.onboarding_submitted_at : patch.onboarding_submitted_at,
      legacySync
    });
  } catch (err) {
    if (err && err.status === 409) {
      return json(409, { error: err.message || "Conflito ao associar atleta" });
    }
    return json(500, { error: err.message || "Erro ao guardar onboarding" });
  }
};
