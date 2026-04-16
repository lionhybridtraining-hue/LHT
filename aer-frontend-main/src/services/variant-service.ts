import { getAccessToken } from "@/lib/supabase";

const API_BASE = "/.netlify/functions";

// ── Types ──

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export interface ProgramVariant {
  id: string;
  training_program_id: string;
  duration_weeks: number;
  experience_level: ExperienceLevel;
  weekly_frequency: number;
  strength_plan_id: string | null;
  running_plan_template_id: string | null;
  running_config_preset: RunningConfigPreset | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined FK data (from getVariantById select)
  strength_plans?: { id: string; name: string } | null;
  running_plan_templates?: { id: string; name: string } | null;
  compatible_presets?: VariantCompatiblePreset[];
}

export interface VariantCompatiblePreset {
  id?: string;
  preset_id: string;
  sort_order: number;
  is_default: boolean;
  preset?: {
    id: string;
    training_program_id: string;
    preset_name: string;
    description: string | null;
    total_training_days: number;
    is_default: boolean;
    sort_order: number;
  } | null;
}

export interface RunningConfigPreset {
  initial_weekly_volume_km?: number;
  weekly_progression_pct?: number;
  periodization_type?: "linear" | "undulating" | "block";
}

export interface VariantFilters {
  experienceLevel?: ExperienceLevel;
  weeklyFrequency?: number;
  durationWeeks?: number;
}

// ── Helpers ──

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ── API ──

export async function fetchVariantsForProgram(
  programId: string,
  filters?: VariantFilters
): Promise<{ variants: ProgramVariant[] }> {
  const headers = await authHeaders();
  let url = `${API_BASE}/admin-program-variants?program_id=${encodeURIComponent(programId)}`;
  if (filters?.experienceLevel) {
    url += `&experience_level=${encodeURIComponent(filters.experienceLevel)}`;
  }
  if (filters?.weeklyFrequency != null) {
    url += `&weekly_frequency=${filters.weeklyFrequency}`;
  }
  if (filters?.durationWeeks != null) {
    url += `&duration_weeks=${filters.durationWeeks}`;
  }
  const res = await fetch(url, { method: "GET", headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

export async function selectVariantForAssignment(
  assignmentId: string,
  variantId: string,
  presetId: string,
  options?: {
    fromWeek?: number;
  }
): Promise<{
  generated: number;
  totalWeeks: number;
  presetName: string;
  variantId: string | null;
  slotsPerWeek: number;
}> {
  const headers = await authHeaders();
  const body: Record<string, unknown> = {
    assignment_id: assignmentId,
    variant_id: variantId,
    preset_id: presetId,
    source: "athlete_setup",
  };
  if (options?.fromWeek != null) body.from_week = options.fromWeek;
  const res = await fetch(`${API_BASE}/athlete-weekly-plan`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const code = data?.code ? ` [${data.code}]` : "";
    const field = data?.field ? ` Campo: ${data.field}.` : "";
    const detail = data?.detail ? ` Detalhe: ${data.detail}` : "";
    throw new Error(
      `${data.error || `API error ${res.status}`}${code}${field}${detail}`
    );
  }
  return data;
}

// ── Utility: extract unique filter options from a variant list ──

export function extractVariantFilterOptions(variants: ProgramVariant[]) {
  const durations = [...new Set(variants.map((v) => v.duration_weeks))].sort(
    (a, b) => a - b
  );
  const levels = [...new Set(variants.map((v) => v.experience_level))].sort();
  const frequencies = [
    ...new Set(variants.map((v) => v.weekly_frequency)),
  ].sort((a, b) => a - b);
  return { durations, levels, frequencies };
}
