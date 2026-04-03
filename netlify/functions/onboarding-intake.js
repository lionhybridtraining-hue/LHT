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
    path: `onboarding_intake?identity_id=eq.${encodeURIComponent(identityId)}&select=id,identity_id,athlete_id,email,phone,full_name,goal_distance,weekly_frequency,experience_level,consistency_level,funnel_stage,plan_generated_at,plan_storage,answers,submitted_at,updated_at&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

const LEGACY_ONBOARDING_FIELD_TYPES = {
  nome_completo: "string",
  sexo: "string",
  telemovel: "string",
  data_nascimento: "date",
  peso_kg: "number",
  peso_ideal_kg: "number",
  altura_m: "number",
  massa_gorda_percent: "number",
  perimetro_abdominal_cm: "number",
  profissao: "string",
  nivel_atividade_diaria: "string",
  media_passos_diarios: "string",
  habitos_ajudam: "string",
  habitos_atrapalham: "string",
  horas_sono_media: "number",
  qualidade_sono: "number",
  sono_reparador: "string",
  qualidade_alimentacao: "number",
  padrao_alimentar: "string_array",
  apetites_dia: "string",
  melhoria_alimentacao: "string",
  litros_agua_dia: "number",
  dificuldade_hidratacao: "string",
  suplementos: "string_array",
  opiniao_suplementacao: "string",
  condicao_saude_diagnosticada: "string",
  checkup_recente: "string",
  medicacao_diaria: "string",
  acompanhamento_profissional: "string",
  lesao_atual: "string",
  dores_regulares: "string",
  intervencao_cirurgica: "string",
  sintomas_treino: "string_array",
  condicao_mental_emocional: "string",
  treina_ginasio_atualmente: "string",
  tempo_consistencia_treino: "string",
  experiencia_ginasio: "string",
  desporto_regular: "string",
  acompanhamento_pt: "string",
  partilha_experiencia_treino: "string",
  porque_agora: "string",
  mudanca_desejada: "string",
  tentativas_anteriores: "string",
  auto_sabotagem: "string_array",
  falo_comigo_dificil: "string_array",
  gatilho_dias_dificeis: "string",
  frase_motivacao: "string",
  maior_objetivo: "string",
  notas_finais: "string"
};

async function syncLegacyOnboarding(config, { identityId, email, answers, submittedAt }) {
  const root = asObject(answers);
  const legacyRow = {
    identity_id: identityId,
    email,
    submitted_at: submittedAt,
    updated_at: new Date().toISOString()
  };

  for (const [key, type] of Object.entries(LEGACY_ONBOARDING_FIELD_TYPES)) {
    const value = normalizeLegacyFieldValue(root[key], type);
    if (value !== undefined) {
      legacyRow[key] = value;
    }
  }

  const hasLegacyPayload = Object.keys(legacyRow).some(
    (key) => !["identity_id", "email", "submitted_at", "updated_at"].includes(key)
  );
  if (!hasLegacyPayload) {
    return { attempted: false, synced: false, reason: "no_legacy_fields_in_payload" };
  }

  try {
    await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: "onboarding_form_responses?on_conflict=identity_id",
      method: "POST",
      body: [legacyRow],
      prefer: "resolution=merge-duplicates,return=minimal"
    });

    return { attempted: true, synced: true, reason: null };
  } catch (err) {
    const message = String((err && err.message) || "");
    if (message.includes("onboarding_form_responses") || message.includes("relation")) {
      return {
        attempted: true,
        synced: false,
        reason: "legacy_table_unavailable"
      };
    }

    return {
      attempted: true,
      synced: false,
      reason: "legacy_sync_failed",
      error: message || "unknown_error"
    };
  }
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

  const hasLegacyOnboardingAnswers = [
    root.nome_completo,
    root.telemovel,
    root.data_nascimento,
    root.peso_kg,
    root.profissao,
    root.maior_objetivo
  ].some((value) => value !== undefined && value !== null && value !== "");

  const hasLandingAnswers =
    Object.keys(landing).length > 0 ||
    [root.goal_distance, root.goalDistance, root.weekly_frequency, root.weeklyFrequency].some(
      (value) => value !== undefined && value !== null && value !== ""
    );

  return {
    phone: normalizePhone(pickFirstDefined(landing.phone, root.telemovel, root.phone)),
    full_name: toOptionalString(
      pickFirstDefined(landing.name, root.nome_completo, root.full_name, root.fullName)
    ),
    goal_distance: Number.isFinite(goalDistance) ? goalDistance : null,
    weekly_frequency: Number.isFinite(weeklyFrequency) ? weeklyFrequency : null,
    experience_level: toOptionalString(
      pickFirstDefined(landing.experienceLevel, root.experience_level, root.nivel_experiencia)
    ),
    consistency_level: toOptionalString(
      pickFirstDefined(landing.currentConsistency, root.consistency_level, root.nivel_consistencia)
    ),
    funnel_stage: planGeneration.plan_data
      ? "plan_generated"
      : hasLegacyOnboardingAnswers
        ? "onboarding_submitted"
        : hasLandingAnswers
          ? "landing_submitted"
          : "landing",
    plan_generated_at: planGeneration.plan_data ? new Date().toISOString() : null,
    plan_storage:
      planGeneration && planGeneration.storage && typeof planGeneration.storage === "string"
        ? planGeneration.storage
        : null,
  };
}

function pickFirstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function pickFirstNonNull(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

function mergeFunnelStage(existingStage, incomingStage) {
  const rank = {
    landing: 0,
    landing_submitted: 1,
    onboarding_submitted: 2,
    plan_generated: 3
  };

  const normalizedExisting = typeof existingStage === "string" ? existingStage : "landing";
  const normalizedIncoming = typeof incomingStage === "string" ? incomingStage : "landing";

  return (rank[normalizedIncoming] || 0) >= (rank[normalizedExisting] || 0)
    ? normalizedIncoming
    : normalizedExisting;
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

function normalizeLegacyFieldValue(value, type) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (type === "string") {
    const parsed = toOptionalString(String(value));
    return parsed === null ? undefined : parsed;
  }

  if (type === "number") {
    const parsed = toFiniteNumber(value);
    return parsed === null ? undefined : parsed;
  }

  if (type === "date") {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return undefined;
    }
    return trimmed;
  }

  if (type === "string_array") {
    if (Array.isArray(value)) {
      return value
        .map((item) => toOptionalString(String(item)))
        .filter((item) => typeof item === "string" && item.length > 0);
    }

    if (typeof value === "string") {
      const single = toOptionalString(value);
      return single ? [single] : [];
    }

    return [];
  }

  return undefined;
}

function inferLeadSource(answers) {
  const root = asObject(answers);
  if (root.plan_generation || root.planocorrida_landing) {
    return "planocorrida_landing";
  }
  return "onboarding";
}

function inferLeadStatus(funnelStage) {
  if (funnelStage === "plan_generated" || funnelStage === "onboarding_submitted") {
    return "qualified";
  }
  return "new";
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

    // GET: apenas autenticação necessária (prefill de landing, pré-pagamento)
    if (event.httpMethod === "GET") {
      const existing = await getExistingByIdentity(config, user.id);
      return json(200, {
        ok: true,
        profile: existing
          ? {
              athleteId: existing.athlete_id || null,
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

    // POST: verifica acesso ao programa apenas quando program_id/program_external_id e explicitamente fornecido
    const query = event.queryStringParameters || {};
    const hasProgramParam = !!(query.program_id || query.program || query.program_external_id);

    if (hasProgramParam) {
      const access = await getProgramAccess(config, {
        identityId: user.id,
        programId: query.program_id,
        programExternalId: query.program || query.program_external_id
      });
      if (!access.program) {
        return json(404, { error: "Programa nao encontrado" });
      }
      if (!access.hasAccess) {
        return json(403, { error: "Pagamento necessario para aceder ao onboarding" });
      }
    }

    const existing = await getExistingByIdentity(config, user.id);
    const structured = extractStructuredFromAnswers(answers);
    const now = new Date().toISOString();
    const mergedAnswers = {
      ...(existing && existing.answers ? existing.answers : {}),
      ...answers
    };
    const athlete = await upsertAthleteByIdentity(config, {
      identityId: user.id,
      email: user.email,
      name: pickFirstNonNull(structured.full_name, existing ? existing.full_name : null, user.email)
    });

    const row = {
      identity_id: user.id,
      athlete_id: athlete.id,
      email: user.email,
      phone: pickFirstNonNull(structured.phone, existing ? existing.phone : null),
      full_name: pickFirstNonNull(structured.full_name, existing ? existing.full_name : null),
      goal_distance: pickFirstNonNull(structured.goal_distance, existing ? existing.goal_distance : null),
      weekly_frequency: pickFirstNonNull(structured.weekly_frequency, existing ? existing.weekly_frequency : null),
      experience_level: pickFirstNonNull(
        structured.experience_level,
        existing ? existing.experience_level : null
      ),
      consistency_level: pickFirstNonNull(
        structured.consistency_level,
        existing ? existing.consistency_level : null
      ),
      funnel_stage: mergeFunnelStage(existing ? existing.funnel_stage : null, structured.funnel_stage),
      plan_generated_at: pickFirstNonNull(
        structured.plan_generated_at,
        existing ? existing.plan_generated_at : null
      ),
      plan_storage: pickFirstNonNull(structured.plan_storage, existing ? existing.plan_storage : null),
      answers: mergedAnswers,
      submitted_at: existing && existing.submitted_at ? existing.submitted_at : now,
      updated_at: now
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
    const legacySync = await syncLegacyOnboarding(config, {
      identityId: user.id,
      email: user.email,
      answers: mergedAnswers,
      submittedAt: record ? record.submitted_at : row.submitted_at
    });

    await upsertCentralLead(config, {
      athleteId: athlete.id,
      identityId: user.id,
      source: inferLeadSource(mergedAnswers),
      email: user.email,
      phone: row.phone,
      fullName: row.full_name,
      funnelStage: row.funnel_stage,
      leadStatus: inferLeadStatus(row.funnel_stage),
      lastActivityAt: now,
      lastActivityType: "onboarding_intake_submitted",
      profile: {
        goalDistance: row.goal_distance,
        weeklyFrequency: row.weekly_frequency,
        experienceLevel: row.experience_level,
        consistencyLevel: row.consistency_level,
        answersKeys: Object.keys(mergedAnswers).sort()
      },
      rawPayload: {
        onboardingIntakeId: record ? record.id || null : null,
        funnelStage: row.funnel_stage,
        submittedAt: record ? record.submitted_at : row.submitted_at
      }
    });

    return json(200, {
      ok: true,
      athleteId: athlete.id,
      submittedAt: record ? record.submitted_at : row.submitted_at,
      legacySync
    });
  } catch (err) {
    if (err && err.status === 409) {
      return json(409, { error: err.message || "Conflito ao associar atleta" });
    }
    return json(500, { error: err.message || "Erro ao guardar onboarding" });
  }
};
