const { json, parseJsonBody } = require('./_lib/http');
const { getConfig } = require('./_lib/config');
const { requireAuthenticatedUser } = require('./_lib/authz');
const {
  getAthleteByIdentity,
  upsertAthleteByIdentity,
  getOnboardingIntakeByIdentity,
  updateAthlete
} = require('./_lib/supabase');

async function supabaseRequest({ url, serviceRoleKey, path, method = 'GET', body, prefer }) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=representation'
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
    const detail = payload && payload.message ? payload.message : `Supabase error ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSex(value) {
  const sex = toNullableString(value);
  if (!sex) return null;
  const normalized = sex.toLowerCase();
  return ['male', 'female', 'other'].includes(normalized) ? normalized : null;
}

function sanitizeOnboarding(intake) {
  const answers = intake && intake.answers && typeof intake.answers === 'object' ? intake.answers : {};
  return {
    fullName: toNullableString((intake && intake.full_name) || answers.nome_completo || answers.full_name || answers.fullName),
    phone: toNullableString((intake && intake.phone) || answers.telemovel || answers.phone),
    goalDistance: toNullableNumber((intake && intake.goal_distance) || answers.goal_distance || answers.goalDistance),
    weeklyFrequency: toNullableNumber((intake && intake.weekly_frequency) || answers.weekly_frequency || answers.weeklyFrequency),
    experienceLevel: toNullableString((intake && intake.experience_level) || answers.experience_level || answers.nivel_experiencia),
    consistencyLevel: toNullableString((intake && intake.consistency_level) || answers.consistency_level || answers.nivel_consistencia)
  };
}

function computeMissingFields(athlete, onboarding) {
  const missingOnboarding = [];
  const missingPersonal = [];

  if (!onboarding.goalDistance) missingOnboarding.push('goalDistance');
  if (!onboarding.weeklyFrequency) missingOnboarding.push('weeklyFrequency');
  if (!onboarding.experienceLevel) missingOnboarding.push('experienceLevel');
  if (!onboarding.consistencyLevel) missingOnboarding.push('consistencyLevel');

  if (!athlete.date_of_birth) missingPersonal.push('dateOfBirth');
  if (!athlete.height_cm) missingPersonal.push('heightCm');
  if (!athlete.weight_kg) missingPersonal.push('weightKg');
  if (!athlete.sex) missingPersonal.push('sex');

  return {
    missingOnboarding,
    missingPersonal,
    onboardingComplete: missingOnboarding.length === 0,
    personalComplete: missingPersonal.length === 0
  };
}

async function ensureAthlete(config, user) {
  const existing = await getAthleteByIdentity(config, user.sub);
  if (existing) return existing;

  return upsertAthleteByIdentity(config, {
    identityId: user.sub,
    email: user.email,
    name: user.user_metadata && user.user_metadata.full_name
      ? user.user_metadata.full_name
      : user.email
  });
}

async function upsertOnboardingIntake(config, identityId, athlete, payload) {
  const now = new Date().toISOString();
  const current = await getOnboardingIntakeByIdentity(config, identityId);
  const currentAnswers = current && current.answers && typeof current.answers === 'object' ? current.answers : {};

  const fullName = toNullableString(payload.fullName) || toNullableString(current && current.full_name) || toNullableString(athlete.name);
  const phone = toNullableString(payload.phone) || toNullableString(current && current.phone);
  const goalDistance = toNullableNumber(payload.goalDistance);
  const weeklyFrequency = toNullableNumber(payload.weeklyFrequency);
  const experienceLevel = toNullableString(payload.experienceLevel);
  const consistencyLevel = toNullableString(payload.consistencyLevel);

  const mergedAnswers = {
    ...currentAnswers,
    ...(fullName ? { nome_completo: fullName, full_name: fullName } : {}),
    ...(phone ? { telemovel: phone, phone } : {}),
    ...(goalDistance ? { goal_distance: goalDistance, goalDistance } : {}),
    ...(weeklyFrequency ? { weekly_frequency: weeklyFrequency, weeklyFrequency } : {}),
    ...(experienceLevel ? { experience_level: experienceLevel, nivel_experiencia: experienceLevel } : {}),
    ...(consistencyLevel ? { consistency_level: consistencyLevel, nivel_consistencia: consistencyLevel } : {})
  };

  const row = {
    identity_id: identityId,
    athlete_id: athlete.id,
    email: athlete.email,
    phone,
    full_name: fullName,
    goal_distance: goalDistance,
    weekly_frequency: weeklyFrequency,
    experience_level: experienceLevel,
    consistency_level: consistencyLevel,
    funnel_stage: 'onboarding_submitted',
    answers: mergedAnswers,
    submitted_at: current && current.submitted_at ? current.submitted_at : now,
    updated_at: now
  };

  if (!current) {
    row.created_at = now;
  }

  await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: 'onboarding_intake?on_conflict=identity_id',
    method: 'POST',
    body: [row],
    prefer: 'resolution=merge-duplicates,return=minimal'
  });
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (method !== 'GET' && method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const user = auth.user;
    const athlete = await ensureAthlete(config, user);
    if (!athlete) {
      return json(500, { error: 'Failed to resolve athlete profile' });
    }

    if (method === 'POST') {
      const body = parseJsonBody(event);

      const personalPatch = {
        ...(toNullableString(body.fullName) ? { name: toNullableString(body.fullName) } : {}),
        date_of_birth: toNullableString(body.dateOfBirth),
        height_cm: toNullableNumber(body.heightCm),
        weight_kg: toNullableNumber(body.weightKg),
        sex: normalizeSex(body.sex)
      };

      const updatedAthlete = await updateAthlete(config, athlete.id, personalPatch);
      await upsertOnboardingIntake(config, user.sub, updatedAthlete || athlete, body);
    }

    const freshAthlete = await getAthleteByIdentity(config, user.sub);
    const intake = await getOnboardingIntakeByIdentity(config, user.sub);
    const onboarding = sanitizeOnboarding(intake);
    const completion = computeMissingFields(freshAthlete || athlete, onboarding);

    return json(200, {
      athlete: {
        id: (freshAthlete || athlete).id,
        email: (freshAthlete || athlete).email,
        name: (freshAthlete || athlete).name || null,
        dateOfBirth: (freshAthlete || athlete).date_of_birth || null,
        heightCm: (freshAthlete || athlete).height_cm || null,
        weightKg: (freshAthlete || athlete).weight_kg || null,
        sex: (freshAthlete || athlete).sex || null
      },
      onboarding,
      completion,
      profileComplete: completion.onboardingComplete && completion.personalComplete
    });
  } catch (error) {
    return json(error.status || 500, { error: error.message || 'Unexpected error' });
  }
};
