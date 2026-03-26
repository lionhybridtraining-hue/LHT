import { getAccessToken } from "@/lib/supabase";

const API_BASE = "/.netlify/functions";

export interface StrengthPlanTemplate {
  id: string;
  name: string;
  description: string | null;
  total_weeks: number;
  load_round: number;
  status: "draft" | "active" | "completed" | "archived";
  training_program_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachExercise {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  video_url: string | null;
  description: string | null;
  default_weight_per_side: boolean;
  default_each_side: boolean;
  default_tempo: string | null;
}

export interface CoachPlanExercise {
  id?: string;
  plan_id: string;
  day_number: number;
  section: "warm_up" | "plyos_speed" | "main" | "conditioning" | "observations";
  superset_group: string | null;
  exercise_order: number;
  exercise_id: string;
  each_side: boolean;
  weight_per_side: boolean;
  plyo_mechanical_load: "high" | "medium" | "low" | null;
  rm_percent_increase_per_week: number | null;
  alt_progression_exercise_id?: string | null;
  alt_regression_exercise_id?: string | null;
  exercise?: CoachExercise | null;
}

export interface CoachPrescription {
  id?: string;
  plan_exercise_id: string;
  week_number: number;
  prescription_type: "reps" | "duration";
  sets: number;
  reps: number | null;
  reps_min: number | null;
  reps_max: number | null;
  duration_seconds: number | null;
  rest_seconds: number | null;
  rir: number | null;
  tempo: string | null;
  gct: string | null;
  method: string;
  rm_percent_override: number | null;
  load_override_kg: number | null;
  coach_notes: string | null;
}

export interface CoachPhaseNote {
  id?: string;
  plan_id: string;
  day_number: number;
  section: string;
  week_number: number;
  notes: string;
}

export interface StrengthPlanFull {
  plan: StrengthPlanTemplate;
  exercises: CoachPlanExercise[];
  prescriptions: CoachPrescription[];
  phaseNotes: CoachPhaseNote[];
}

export interface CoachAthlete {
  id: string;
  name: string;
  email: string;
  label: string;
}

export interface CreateStrengthPlanInput {
  name: string;
  total_weeks: number;
  description?: string;
  load_round?: number;
  training_program_id?: string;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers || {}) },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `API error ${res.status}`);
  }

  return data as T;
}

export async function listStrengthPlans(status?: string): Promise<StrengthPlanTemplate[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await apiFetch<{ plans: StrengthPlanTemplate[] }>(`/strength-plan${qs}`);
  return data.plans || [];
}

export async function createStrengthPlan(payload: CreateStrengthPlanInput): Promise<StrengthPlanTemplate> {
  const data = await apiFetch<{ plan: StrengthPlanTemplate }>("/strength-plan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.plan;
}

export async function getStrengthPlanFull(planId: string): Promise<StrengthPlanFull> {
  return apiFetch<StrengthPlanFull>(`/strength-plan?planId=${encodeURIComponent(planId)}`);
}

export async function saveStrengthPlanContent(payload: {
  plan_id: string;
  exercises?: CoachPlanExercise[];
  prescriptions?: CoachPrescription[];
  phase_notes?: CoachPhaseNote[];
  delete_exercise_ids?: string[];
}): Promise<StrengthPlanFull> {
  return apiFetch<StrengthPlanFull>("/strength-plan", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function listCoachExercises(): Promise<CoachExercise[]> {
  const data = await apiFetch<{ exercises: CoachExercise[] }>("/exercises");
  return data.exercises || [];
}

export async function listCoachAthletes(): Promise<CoachAthlete[]> {
  const data = await apiFetch<{ athletes: CoachAthlete[] }>("/list-athletes");
  return data.athletes || [];
}

export async function assignPlanToAthlete(payload: {
  plan_id: string;
  athlete_id: string;
  start_date?: string | null;
  load_round?: number;
}): Promise<{ instance: { id: string; status: string } }> {
  return apiFetch<{ instance: { id: string; status: string } }>("/strength-plan", {
    method: "POST",
    body: JSON.stringify({
      action: "assign",
      ...payload,
    }),
  });
}
