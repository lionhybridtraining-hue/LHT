type AnswersPayload = Record<string, unknown>;

const ENDPOINT = "/.netlify/functions/onboarding-intake";

export type OnboardingIntakePayload = {
  ok: boolean;
  profile: {
    athleteId: string | null;
    phone: string | null;
    fullName: string | null;
    goalDistance: number | null;
    weeklyFrequency: number | null;
    experienceLevel: string | null;
    consistencyLevel: string | null;
    funnelStage: string | null;
    planGeneratedAt: string | null;
    planStorage: string | null;
  } | null;
  answers: AnswersPayload;
  submittedAt: string | null;
  updatedAt: string | null;
};

export async function fetchOnboardingIntake(accessToken: string) {
  const response = await fetch(ENDPOINT, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Não foi possível carregar os dados do onboarding.");
  }

  return (await response.json()) as OnboardingIntakePayload;
}

export async function fetchOnboardingAnswers(accessToken: string) {
  const payload = await fetchOnboardingIntake(accessToken);
  return payload && payload.answers ? payload.answers : {};
}

export async function upsertOnboardingAnswers(
  accessToken: string,
  answers: AnswersPayload
) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ answers }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Não foi possível guardar os dados.");
  }

  return response.json();
}

export async function mergeOnboardingAnswers(
  accessToken: string,
  partial: AnswersPayload
) {
  const existing = await fetchOnboardingAnswers(accessToken);
  const merged = deepMerge(existing, partial);
  await upsertOnboardingAnswers(accessToken, merged);
  return merged;
}

function deepMerge(target: unknown, source: unknown): AnswersPayload {
  const baseTarget = isPlainObject(target) ? { ...target } : {};
  const baseSource = isPlainObject(source) ? source : {};

  for (const [key, value] of Object.entries(baseSource)) {
    const previousValue = baseTarget[key];
    if (isPlainObject(previousValue) && isPlainObject(value)) {
      baseTarget[key] = deepMerge(previousValue, value);
      continue;
    }
    baseTarget[key] = value;
  }

  return baseTarget;
}

function isPlainObject(value: unknown): value is AnswersPayload {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}