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

export interface RunningPlanExportDownload {
  blob: Blob;
  filename: string;
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

export async function exportAthleteRunningPlan(
  format: "fit" | "tcx" = "fit"
): Promise<RunningPlanExportDownload> {
  const token = await getAccessToken();
  const response = await fetch(
    `${API_BASE}/athlete-running-plan-export?format=${encodeURIComponent(format)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    let errorMessage = `API error ${response.status}`;
    try {
      const payload = await response.json();
      errorMessage = payload.error || errorMessage;
    } catch {
      // Ignore invalid JSON responses.
    }
    throw new Error(errorMessage);
  }

  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] || `lht-running-plan-${format}.zip`,
  };
}
