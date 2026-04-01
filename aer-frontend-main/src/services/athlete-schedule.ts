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
  source: string;
  coach_notes: string | null;
  status: string;
  generated_from_preset_id: string | null;
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
  fromWeek?: number
): Promise<{ generated: number; totalWeeks: number; presetName: string; slotsPerWeek: number }> {
  const headers = await authHeaders();
  const body: Record<string, unknown> = {
    assignment_id: assignmentId,
    preset_id: presetId,
    source: "athlete_setup",
  };
  if (fromWeek != null) body.from_week = fromWeek;
  const res = await fetch(`${API_BASE}/athlete-weekly-plan`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

export async function updateWeeklyPlanRow(
  rowId: string,
  patch: Partial<Pick<WeeklyPlanRow, "status" | "coach_notes">>
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
