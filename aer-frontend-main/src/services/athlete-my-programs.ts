import { getAccessToken } from "@/lib/supabase";

const API_BASE = "/.netlify/functions";

// ── Types ──

export type ProgramPhase =
  | "coached"
  | "self_serve"
  | "active"
  | "grace"
  | "expired"
  | "cancelled";

export interface MyProgramPurchase {
  id: string;
  programId: string;
  billingType: string;
  status: string;
  paidAt: string | null;
  expiresAt: string | null;
  gracePeriodEndsAt: string | null;
}

export interface MyProgramMeta {
  id: string;
  name: string;
  accessModel: string;
  durationWeeks: number;
  billingType: string;
}

export interface MyProgramInstance {
  id: string;
  status: "active" | "paused" | "completed" | "cancelled";
  startDate: string | null;
  coachLockedUntil: string | null;
  accessModel: string | null;
  planName: string | null;
}

export interface MyProgramTemplate {
  id: string;
  name: string;
  description: string | null;
  totalWeeks: number;
  status: string;
}

export interface MyProgram {
  purchase: MyProgramPurchase;
  program: MyProgramMeta | null;
  instance: MyProgramInstance | null;
  phase: ProgramPhase;
  isCoachLocked: boolean;
  isInGrace: boolean;
  canCreateInstance: boolean;
  /** "purchase" = Stripe-based, "assignment" = coach-assigned without Stripe */
  sourceType?: "purchase" | "assignment";
  availableTemplates?: MyProgramTemplate[];
  /** Who picks the preset: 'coach' or 'athlete' */
  presetSelection?: "coach" | "athlete";
  /** Preset already selected for this assignment (null if not yet chosen) */
  selectedPresetId?: string | null;
  /** Variant already selected for this assignment (null if not yet chosen) */
  selectedVariantId?: string | null;
  /** True if the assignment is active but no preset has been selected yet */
  needsPresetSelection?: boolean;
}

export interface OrphanedInstance {
  id: string;
  plan_id: string;
  athlete_id: string;
  status: "active" | "paused" | "completed" | "cancelled";
  start_date: string | null;
  load_round: number;
  access_model: string | null;
  coach_locked_until: string | null;
  assigned_by: string | null;
  program_assignment_id: string | null;
  created_at: string | null;
  plan?: { id: string; name?: string; training_program_id?: string } | null;
}

export interface AthleteMyProgramsResponse {
  programs: MyProgram[];
  orphanedInstances: OrphanedInstance[];
}

// ── API ──

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function fetchMyPrograms(): Promise<AthleteMyProgramsResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/athlete-my-programs`, {
    method: "GET",
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `API error ${res.status}`);
  }
  return data as AthleteMyProgramsResponse;
}
