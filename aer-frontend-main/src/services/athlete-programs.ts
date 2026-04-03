import { getAccessToken } from "@/lib/supabase";

const API_BASE = "/.netlify/functions";

export type RunningPlanStatus = "active" | "pending" | "none";

export interface RunningPlanEntry {
  id: string;
  status: RunningPlanStatus;
  storage: "program_assignments" | "onboarding_intake";
  generatedAt: string | null;
  updatedAt: string | null;
  programDistanceKm: number | null;
  trainingFrequency: number | null;
  hasPlanData: boolean;
  source: "assignment" | "onboarding";
  openPath: string;
  regeneratePath: string;
}

export interface AthleteRunningProgramsResponse {
  runningPrograms: RunningPlanEntry[];
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function fetchAthleteRunningPrograms(): Promise<AthleteRunningProgramsResponse> {
  const headers = await authHeaders();
  const response = await fetch(`${API_BASE}/athlete-running-programs`, {
    method: "GET",
    headers,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `API error ${response.status}`);
  }
  return data as AthleteRunningProgramsResponse;
}
