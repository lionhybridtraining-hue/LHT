import type { SetData } from "@/components/atleta/ExerciseScreen";

export interface SavedWorkoutState {
  sessionId: string;
  planId: string;
  weekNumber: number;
  dayNumber: number;
  currentIndex: number;
  loggedSets: SetData[];
  startedAt: string;
}

const STORAGE_KEY = "lht_active_workout";

export function saveWorkoutState(state: SavedWorkoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function loadWorkoutState(): SavedWorkoutState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedWorkoutState;
  } catch (err) {
    console.warn("Failed to load workout state:", err);
    return null;
  }
}

export function clearWorkoutState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
