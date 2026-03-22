const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");

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
    const details = payload && payload.message ? payload.message : `Supabase error ${response.status}`;
    const error = new Error(details);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function parseQuery(event) {
  const query = event.queryStringParameters || {};
  return {
    identityId: normalizeInput(query.identity_id || query.identityId),
    athleteId: normalizeInput(query.athlete_id || query.athleteId),
    email: normalizeEmail(query.email)
  };
}

function normalizeInput(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

async function getOnboardingIntake(config, { identityId, email }) {
  const params = [
    "select=id,identity_id,athlete_id,email,phone,full_name,goal_distance,weekly_frequency,experience_level,consistency_level,funnel_stage,plan_generated_at,plan_storage,submitted_at,updated_at"
  ];

  if (identityId) params.push(`identity_id=eq.${encodeURIComponent(identityId)}`);
  if (email) params.push(`email=eq.${encodeURIComponent(email)}`);

  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `onboarding_intake?${params.join("&")}&order=updated_at.desc&limit=20`
  });

  return Array.isArray(rows) ? rows : [];
}

async function getOnboardingFormResponses(config, { identityId, email }) {
  const params = [
    "select=id,identity_id,email,nome_completo,telemovel,data_nascimento,created_at,updated_at"
  ];

  if (identityId) params.push(`identity_id=eq.${encodeURIComponent(identityId)}`);
  if (email) params.push(`email=eq.${encodeURIComponent(email)}`);

  try {
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `onboarding_form_responses?${params.join("&")}&order=updated_at.desc&limit=20`
    });

    return {
      available: true,
      rows: Array.isArray(rows) ? rows : []
    };
  } catch (error) {
    const message = (error && error.message) || "";
    if (message.includes("onboarding_form_responses") || message.includes("relation")) {
      return {
        available: false,
        rows: [],
        warning: "Tabela onboarding_form_responses nao encontrada no ambiente atual"
      };
    }

    throw error;
  }
}

async function getAthletes(config, { identityId, athleteId, email }) {
  const params = [
    "select=id,identity_id,name,email,coach_identity_id,created_at,updated_at",
    "order=updated_at.desc",
    "limit=20"
  ];

  if (athleteId) params.push(`id=eq.${encodeURIComponent(athleteId)}`);
  if (identityId) params.push(`identity_id=eq.${encodeURIComponent(identityId)}`);
  if (email) params.push(`email=eq.${encodeURIComponent(email)}`);

  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?${params.join("&")}`
  });

  return Array.isArray(rows) ? rows : [];
}

async function getAssignmentSnapshot(config, athleteId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_assignments?athlete_id=eq.${encodeURIComponent(athleteId)}&select=id,athlete_id,coach_id,program_id,status,start_date,end_date,created_at,updated_at&order=updated_at.desc&limit=5`
  });

  return Array.isArray(rows) ? rows : [];
}

async function getLatestTrainingSession(config, athleteId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}&select=id,session_date,title,sport_type,tss,duration_minutes,created_at,updated_at&order=session_date.desc&limit=1`
  });

  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getLatestWeeklyCheckin(config, athleteId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `weekly_checkins?athlete_id=eq.${encodeURIComponent(athleteId)}&select=id,week_start,status,responded_at,created_at,updated_at&order=week_start.desc&limit=1`
  });

  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function buildIssues({ onboardingIntakeRows, onboardingFormRows, onboardingFormAvailable, athleteRows, query }) {
  const issues = [];
  const linkedAthleteIds = new Set(
    onboardingIntakeRows
      .map((row) => row && row.athlete_id)
      .filter((value) => typeof value === "string" && value.length > 0)
  );
  const athleteIds = new Set(
    athleteRows
      .map((row) => row && row.id)
      .filter((value) => typeof value === "string" && value.length > 0)
  );
  const athleteIdentityIds = new Set(
    athleteRows
      .map((row) => row && row.identity_id)
      .filter((value) => typeof value === "string" && value.length > 0)
  );

  if (!onboardingFormAvailable) {
    issues.push("Tabela onboarding_form_responses indisponivel neste ambiente");
  }

  if (onboardingIntakeRows.length > 0 && athleteRows.length === 0) {
    issues.push("Existe onboarding_intake mas nao existe registo correspondente em athletes para os filtros usados");
  }

  if (athleteRows.length > 0 && onboardingIntakeRows.length === 0) {
    issues.push("Existe athlete mas nao existe onboarding_intake para os filtros usados");
  }

  if (query.identityId && athleteRows.some((athlete) => athlete.id === query.identityId)) {
    issues.push("identity_id coincide com athletes.id; validar se esta associacao e intencional em todos os fluxos");
  }

  if (query.identityId && athleteRows.length > 0 && !athleteIdentityIds.has(query.identityId)) {
    issues.push("Existe athlete para os filtros, mas athletes.identity_id nao corresponde ao identity_id pesquisado");
  }

  if (onboardingIntakeRows.some((row) => !row.athlete_id)) {
    issues.push("Existe onboarding_intake sem athlete_id associado");
  }

  if (linkedAthleteIds.size > 0) {
    const missingAthletes = Array.from(linkedAthleteIds).filter((id) => !athleteIds.has(id));
    if (missingAthletes.length > 0) {
      issues.push("onboarding_intake referencia athlete_id inexistente em athletes");
    }
  }

  if (query.athleteId && onboardingIntakeRows.length > 0 && !linkedAthleteIds.has(query.athleteId)) {
    issues.push("Foi encontrado onboarding_intake, mas athlete_id nao corresponde ao athlete_id pesquisado");
  }

  if (onboardingFormRows.length > 0 && onboardingIntakeRows.length === 0) {
    issues.push("Foram encontrados dados em onboarding_form_responses sem onboarding_intake correspondente");
  }

  return issues;
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function summarizeOnboardingCoverage(onboardingIntakeRows, onboardingFormRows) {
  const intakeRow = Array.isArray(onboardingIntakeRows) && onboardingIntakeRows.length
    ? onboardingIntakeRows[0]
    : null;
  const legacyRow = Array.isArray(onboardingFormRows) && onboardingFormRows.length
    ? onboardingFormRows[0]
    : null;

  const intakeFields = [
    "phone",
    "full_name",
    "goal_distance",
    "weekly_frequency",
    "experience_level",
    "consistency_level",
    "funnel_stage",
    "plan_generated_at",
    "plan_storage"
  ];

  const legacyFields = [
    "nome_completo",
    "telemovel",
    "data_nascimento"
  ];

  const intakeFilled = intakeFields.filter((field) => hasValue(intakeRow ? intakeRow[field] : null));
  const legacyFilled = legacyFields.filter((field) => hasValue(legacyRow ? legacyRow[field] : null));

  return {
    onboardingIntake: {
      totalFieldsTracked: intakeFields.length,
      filledFields: intakeFilled.length,
      missingFields: intakeFields.filter((field) => !intakeFilled.includes(field))
    },
    onboardingLegacy: {
      totalFieldsTracked: legacyFields.length,
      filledFields: legacyFilled.length,
      missingFields: legacyFields.filter((field) => !legacyFilled.includes(field))
    }
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const query = parseQuery(event);
    if (!query.identityId && !query.athleteId && !query.email) {
      return json(400, {
        error: "Fornece pelo menos identity_id, athlete_id ou email"
      });
    }

    const [onboardingIntakeRows, onboardingFormResult, athleteRows] = await Promise.all([
      getOnboardingIntake(config, query),
      getOnboardingFormResponses(config, query),
      getAthletes(config, query)
    ]);

    const athleteIds = [
      ...new Set(athleteRows.map((athlete) => athlete.id).filter((id) => typeof id === "string" && id.length))
    ];

    const perAthlete = [];
    for (const athleteId of athleteIds) {
      const [assignments, latestSession, latestCheckin] = await Promise.all([
        getAssignmentSnapshot(config, athleteId),
        getLatestTrainingSession(config, athleteId),
        getLatestWeeklyCheckin(config, athleteId)
      ]);

      perAthlete.push({
        athleteId,
        assignments,
        latestTrainingSession: latestSession,
        latestWeeklyCheckin: latestCheckin
      });
    }

    const issues = buildIssues({
      onboardingIntakeRows,
      onboardingFormRows: onboardingFormResult.rows,
      onboardingFormAvailable: onboardingFormResult.available,
      athleteRows,
      query
    });
    const onboardingCoverage = summarizeOnboardingCoverage(
      onboardingIntakeRows,
      onboardingFormResult.rows
    );

    return json(200, {
      ok: true,
      query,
      onboarding_intake: onboardingIntakeRows,
      onboarding_form_responses: {
        available: onboardingFormResult.available,
        warning: onboardingFormResult.warning || null,
        rows: onboardingFormResult.rows
      },
      athletes: athleteRows,
      athlete_data: perAthlete,
      onboardingCoverage,
      issues
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao auditar dados do atleta" });
  }
};
