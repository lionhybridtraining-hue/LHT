type AnswersPayload = Record<string, unknown>;

const ENDPOINT = "/.netlify/functions/onboarding-intake";

export async function fetchOnboardingAnswers(accessToken: string) {
  const response = await fetch(ENDPOINT, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar os dados do onboarding.");
  }

  const payload = await response.json();
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
    throw new Error(payload?.error || "Nao foi possivel guardar os dados.");
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