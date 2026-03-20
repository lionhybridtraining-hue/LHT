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

// ──── Plan Form Draft (Multi-step form) ────────────────────────────────────
export type PlanFormDraft = {
  // Step 1: Objetivo
  programDistance: number;
  trainingFrequency: number;
  
  // Step 2: VDOT
  vdotPath: "race" | "pace" | "level";
  raceDist: number;
  raceTimeStr: string;
  paceType: "easy" | "threshold";
  paceStr: string;
  selectedTier: number | null;
  
  // Step 3: Progressão
  progressionRate: number | null;
  
  // Step 4: Duração
  phaseDuration: number;
  
  // Step 5: Detalhes
  initialVolume: number | "";
  name: string;
  weeklyCommitment: boolean;
  
  // Metadata
  currentStep: number;
  createdAt: string;
  lastModifiedAt: string;
};

const PLAN_FORM_DRAFT_KEY = "lht.planocorrida.formDraft";

export function loadPlanFormDraft(): PlanFormDraft | null {
  try {
    const raw = window.localStorage.getItem(PLAN_FORM_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PlanFormDraft;
  } catch {
    return null;
  }
}

export function savePlanFormDraft(draft: PlanFormDraft) {
  window.localStorage.setItem(PLAN_FORM_DRAFT_KEY, JSON.stringify(draft));
}

export function clearPlanFormDraft() {
  window.localStorage.removeItem(PLAN_FORM_DRAFT_KEY);
}

export function createInitialPlanFormDraft(): PlanFormDraft {
  return {
    // Step 1
    programDistance: 10,
    trainingFrequency: 3,
    
    // Step 2
    vdotPath: "race",
    raceDist: 5,
    raceTimeStr: "",
    paceType: "easy",
    paceStr: "",
    selectedTier: null,
    
    // Step 3
    progressionRate: null,
    
    // Step 4
    phaseDuration: 12,
    
    // Step 5
    initialVolume: "",
    name: "",
    weeklyCommitment: false,
    
    // Metadata
    currentStep: 1,
    createdAt: new Date().toISOString(),
    lastModifiedAt: new Date().toISOString(),
  };
}