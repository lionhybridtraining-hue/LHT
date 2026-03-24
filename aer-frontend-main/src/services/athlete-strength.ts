import { getAccessToken } from "@/lib/supabase";
import type {
  AthletePlanResponse,
  WorkoutSession,
  LogSet,
} from "@/types/strength";

const API_BASE = "/.netlify/functions";

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
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data as T;
}

// ── Plan ──

export function fetchAthletePlan(
  weekNumber?: number
): Promise<AthletePlanResponse> {
  const qs = weekNumber ? `?weekNumber=${weekNumber}` : "";
  return apiFetch(`/athlete-strength-plan${qs}`);
}

// ── Sessions ──

export function startSession(params: {
  plan_id: string;
  week_number: number;
  day_number: number;
  session_date?: string;
}): Promise<{ session: WorkoutSession }> {
  return apiFetch("/strength-log", {
    method: "POST",
    body: JSON.stringify({ action: "start_session", ...params }),
  });
}

export function finishSession(
  sessionId: string
): Promise<{ session: WorkoutSession }> {
  return apiFetch("/strength-log", {
    method: "POST",
    body: JSON.stringify({ action: "finish_session", session_id: sessionId }),
  });
}

export function cancelSession(
  sessionId: string
): Promise<{ session: WorkoutSession }> {
  return apiFetch("/strength-log", {
    method: "POST",
    body: JSON.stringify({ action: "cancel_session", session_id: sessionId }),
  });
}

// ── Logging Sets ──

export interface LogSetPayload {
  plan_exercise_id: string;
  week_number: number;
  day_number: number;
  session_date?: string;
  set_number: number;
  reps: number;
  load_kg?: number | null;
  rir?: number | null;
  duration_seconds?: number | null;
  method?: string;
  notes?: string;
}

export function submitSets(params: {
  plan_id: string;
  session_id?: string;
  sets: LogSetPayload[];
}): Promise<{ sets: LogSet[]; oneRmUpdates: number }> {
  return apiFetch("/strength-log", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function fetchLogs(
  planId: string,
  weekNumber?: number
): Promise<{ logs: LogSet[] }> {
  let qs = `?planId=${planId}`;
  if (weekNumber) qs += `&weekNumber=${weekNumber}`;
  return apiFetch(`/strength-log${qs}`);
}
