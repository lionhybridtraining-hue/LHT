import { getAccessToken } from "@/lib/supabase";

const API_BASE = "/.netlify/functions";

export interface SchedulePreset {
  id: string;
  training_program_id: string;
  preset_name: string;
  description: string | null;
  total_training_days: number;
  is_default: boolean;
  sort_order: number;
  slots?: ScheduleSlot[];
}

export interface ScheduleSlot {
  id: string;
  preset_id: string;
  day_of_week: number;
  time_slot: number;
  session_id: string;
  sort_order: number;
}

export interface WeeklySession {
  id: string;
  training_program_id: string;
  session_key: string;
  session_type: string;
  session_label: string;
  strength_day_number: number | null;
  running_session_type: string | null;
  duration_estimate_min: number | null;
  intensity: string | null;
  is_optional: boolean;
  sort_priority: number;
}

export interface WeeklyPlanRow {
  id: string;
  athlete_id: string;
  program_assignment_id: string;
  week_number: number;
  week_start_date: string;
  day_of_week: number;
  time_slot: number;
  session_key: string;
  session_type: string;
  session_label: string;
  duration_estimate_min: number | null;
  intensity: string | null;
  strength_instance_id: string | null;
  strength_day_number: number | null;
  running_session_data: Record<string, unknown> | null;
  is_optional: boolean;
  source: string;
  coach_notes: string | null;
  status: string;
  generated_from_preset_id: string | null;
  generated_from_variant_id: string | null;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function fetchSchedulePresets(
  trainingProgramId: string
): Promise<{ presets: SchedulePreset[] }> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API_BASE}/admin-program-schedule?trainingProgramId=${encodeURIComponent(trainingProgramId)}&includeSlots=1`,
    { method: "GET", headers }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

export async function fetchWeeklySessions(
  trainingProgramId: string
): Promise<{ sessions: WeeklySession[] }> {
  const headers = await authHeaders();
  const res = await fetch(
    `${API_BASE}/admin-program-sessions?trainingProgramId=${encodeURIComponent(trainingProgramId)}`,
    { method: "GET", headers }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

export async function fetchAthleteWeeklyPlan(
  assignmentId?: string,
  weekNumber?: number,
  instanceId?: string
): Promise<{ plan: WeeklyPlanRow[] }> {
  const headers = await authHeaders();
  let url = `${API_BASE}/athlete-weekly-plan?`;
  if (assignmentId) url += `assignmentId=${encodeURIComponent(assignmentId)}&`;
  if (weekNumber != null) url += `weekNumber=${weekNumber}&`;
  if (instanceId) url += `instanceId=${encodeURIComponent(instanceId)}&`;
  const res = await fetch(url, { method: "GET", headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

export async function generateWeeklyPlan(
  assignmentId: string,
  presetId: string,
  options?: {
    variantId?: string;
    fromWeek?: number;
    initialWeeklyVolumeKm?: number;
    weeklyProgressionPct?: number;
    periodizationType?: "linear" | "undulating" | "block";
  }
): Promise<{ generated: number; totalWeeks: number; presetName: string; variantId?: string | null; slotsPerWeek: number }> {
  const headers = await authHeaders();
  const body: Record<string, unknown> = {
    assignment_id: assignmentId,
    preset_id: presetId,
    source: "athlete_setup",
  };
  if (options?.variantId) body.variant_id = options.variantId;
  if (options?.fromWeek != null) body.from_week = options.fromWeek;
  if (options?.initialWeeklyVolumeKm != null) {
    body.initial_weekly_volume_km = options.initialWeeklyVolumeKm;
  }
  if (options?.weeklyProgressionPct != null) {
    body.weekly_progression_pct = options.weeklyProgressionPct;
  }
  if (options?.periodizationType) {
    body.periodization_type = options.periodizationType;
  }
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
    throw new Error(`${data.error || `API error ${res.status}`}${code}${field}${detail}`);
  }
  return data;
}

export async function updateWeeklyPlanRow(
  rowId: string,
  patch: Partial<Pick<WeeklyPlanRow, "status" | "coach_notes" | "day_of_week">>
): Promise<{ row: WeeklyPlanRow }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/athlete-weekly-plan`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ id: rowId, ...patch }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

export async function rescheduleWeeklyPlanRow(
  rowId: string,
  targetDayOfWeek: number
): Promise<{ row: WeeklyPlanRow }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/athlete-weekly-plan`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ id: rowId, day_of_week: targetDayOfWeek }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}
