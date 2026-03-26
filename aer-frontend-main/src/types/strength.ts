// Types for the athlete strength training UI

export interface AthleteInfo {
  id: string;
  name: string | null;
  email: string | null;
  strength_level: "beginner" | "intermediate" | "advanced" | null;
  strength_log_detail: "exercise" | "set" | "quick";
}

export interface PlanInstance {
  id: string;
  plan_id: string;
  start_date: string;
  load_round: number;
  status: string;
}

export interface PlanInfo {
  id: string;
  name: string;
  description: string | null;
  total_weeks: number;
  current_week: number;
  quick_mode: boolean;
}

export interface ExerciseDetail {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  video_url: string | null;
  description: string | null;
}

export interface PlanExercise {
  id: string;
  exercise_id: string;
  original_exercise_id: string;
  day_number: number;
  section: "warm_up" | "plyos_speed" | "main" | "conditioning" | "observations";
  exercise_order: number;
  superset_group: string | null;
  each_side: boolean;
  weight_per_side: boolean;
  plyo_mechanical_load: string | null;
  exercise: ExerciseDetail;
}

export interface Prescription {
  id: string;
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
  coach_notes: string | null;
  loadKg: number | null;
  rmPercent: number | null;
}

export interface PhaseNote {
  id: string;
  plan_id: string;
  day_number: number;
  section: string;
  week_number: number;
  notes: string;
}

export interface LogSet {
  id: string;
  athlete_id: string;
  plan_exercise_id: string;
  plan_id: string;
  week_number: number;
  day_number: number;
  session_date: string;
  set_number: number;
  reps: number | null;
  load_kg: number | null;
  rir: number | null;
  duration_seconds: number | null;
  method: string;
  notes: string | null;
  submitted_at: string;
}

export interface WorkoutSession {
  id: string;
  athlete_id: string;
  plan_id: string;
  week_number: number;
  day_number: number;
  session_date: string;
  started_at: string;
  finished_at: string | null;
  cancelled_at: string | null;
  status: "in_progress" | "completed" | "cancelled";
}

export interface SessionSummary extends WorkoutSession {
  sets: LogSet[];
  totalSets: number;
  totalVolume: number;
  totalDuration: number;
  uniqueExercises: number;
}

export interface AthletePlanResponse {
  status: "active" | "no_plan" | "pending";
  message?: string;
  athlete: AthleteInfo;
  instance?: PlanInstance;
  plan?: PlanInfo;
  exercises?: PlanExercise[];
  prescriptions?: Prescription[];
  phaseNotes?: PhaseNote[];
  logs?: LogSet[];
}

// A single step in the workout flow (exercise set or rest)
export interface WorkoutStep {
  type: "exercise" | "rest";
  // Exercise step fields
  planExerciseId?: string;
  exercise?: PlanExercise;
  prescription?: Prescription;
  setNumber?: number;
  totalSets?: number;
  supersetGroup?: string | null;
  // Rest step fields
  restSeconds?: number;
  // Common
  sectionIndex: number;
  groupLabel: string; // e.g. "A", "B", or exercise name for solo
}
