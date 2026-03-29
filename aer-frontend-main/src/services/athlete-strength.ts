import { getAccessToken } from "@/lib/supabase";
import { enqueue } from "@/lib/offline-queue";
import type {
  AthletePlanResponse,
  WorkoutSession,
  LogSet,
  SessionSummary,
  StrengthInstanceSummary,
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
  weekNumber?: number,
  instanceId?: string
): Promise<AthletePlanResponse> {
  const params = new URLSearchParams();
  if (weekNumber) params.set("weekNumber", String(weekNumber));
  if (instanceId) params.set("instanceId", instanceId);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch(`/athlete-strength-plan${qs}`);
}

export function listInstances(): Promise<{ instances: StrengthInstanceSummary[] }> {
  return apiFetch("/athlete-strength-instance");
}

export function createInstance(params: {
  programId: string;
  startDate?: string;
  loadRound?: number;
}): Promise<{ instance: StrengthInstanceSummary }> {
  return apiFetch("/athlete-strength-instance", {
    method: "POST",
    body: JSON.stringify({
      programId: params.programId,
      startDate: params.startDate,
      loadRound: params.loadRound,
    }),
  });
}

export function updateInstanceStatus(params: {
  instanceId: string;
  status: "active" | "paused" | "completed" | "cancelled";
}): Promise<{ instance: StrengthInstanceSummary }> {
  return apiFetch(`/athlete-strength-instance?instanceId=${encodeURIComponent(params.instanceId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: params.status }),
  });
}

// ── Sessions ──

export function startSession(params: {
  plan_id: string;
  week_number: number;
  day_number: number;
  session_date?: string;
}): Promise<{ session: WorkoutSession; resumed?: boolean; sets?: LogSet[] }> {
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

export function submitSetsApi(params: {
  plan_id: string;
  session_id?: string;
  sets: LogSetPayload[];
}): Promise<{ sets: LogSet[]; oneRmUpdates: number }> {
  return apiFetch("/strength-log", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function submitSets(params: {
  plan_id: string;
  session_id?: string;
  sets: LogSetPayload[];
}): Promise<{ sets: LogSet[]; oneRmUpdates: number }> {
  try {
    return await submitSetsApi(params);
  } catch (err) {
    // Queue for retry on network errors only
    if (
      err instanceof TypeError ||
      (typeof navigator !== "undefined" && !navigator.onLine)
    ) {
      enqueue({
        plan_id: params.plan_id,
        session_id: params.session_id,
        sets: params.sets,
      });
      return { sets: [] as LogSet[], oneRmUpdates: 0 };
    }
    throw err;
  }
}

export function fetchLogs(
  planId: string,
  weekNumber?: number
): Promise<{ logs: LogSet[] }> {
  let qs = `?planId=${planId}`;
  if (weekNumber) qs += `&weekNumber=${weekNumber}`;
  return apiFetch(`/strength-log${qs}`);
}

export function fetchSessionHistory(
  planId?: string
): Promise<{ sessions: SessionSummary[] }> {
  let qs = "?action=sessions";
  if (planId) qs += `&planId=${encodeURIComponent(planId)}`;
  return apiFetch(`/strength-log${qs}`);
}
