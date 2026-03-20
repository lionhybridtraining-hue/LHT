export type PlanLandingDraft = {
  name: string;
  phone: string;
  goalDistance: number;
  weeklyFrequency: number;
  experienceLevel: string;
  currentConsistency: string;
  createdAt: string;
  syncedAt?: string;
};

const PLAN_LANDING_DRAFT_KEY = "lht.planocorrida.landingDraft";

export function loadPlanLandingDraft(): PlanLandingDraft | null {
  try {
    const raw = window.localStorage.getItem(PLAN_LANDING_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PlanLandingDraft;
  } catch {
    return null;
  }
}

export function savePlanLandingDraft(draft: PlanLandingDraft) {
  window.localStorage.setItem(PLAN_LANDING_DRAFT_KEY, JSON.stringify(draft));
}

export function clearPlanLandingDraft() {
  window.localStorage.removeItem(PLAN_LANDING_DRAFT_KEY);
}

export function normalizePhone(value: string) {
  return value.replace(/(?!^)\+/g, "").replace(/[^\d+\s-]/g, "").trim();
}

export function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9;
}