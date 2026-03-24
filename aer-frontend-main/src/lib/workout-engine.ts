import type {
  PlanExercise,
  Prescription,
  WorkoutStep,
} from "@/types/strength";

const SECTION_ORDER: PlanExercise["section"][] = [
  "warm_up",
  "plyos_speed",
  "main",
  "conditioning",
  "observations",
];

/**
 * Build the flat step queue for a given day + week.
 *
 * Solo exercises:    E1 S1, E1 S2, E1 S3  → next exercise
 * Superset group A:  A1 S1 → A2 S1 → rest → A1 S2 → A2 S2 → rest → A1 S3 → A2 S3 → next group
 *
 * Rest steps are inserted after each round of a superset (except after the last round).
 * For solo exercises, rest is inserted between sets (except after the last set).
 */
export function buildStepQueue(
  exercises: PlanExercise[],
  prescriptions: Prescription[],
  dayNumber: number,
  weekNumber: number
): WorkoutStep[] {
  const dayExercises = exercises
    .filter((e) => e.day_number === dayNumber)
    .sort((a, b) => a.exercise_order - b.exercise_order);

  // Build prescription lookup: plan_exercise_id → prescription for this week
  const rxMap = new Map<string, Prescription>();
  for (const rx of prescriptions) {
    if (rx.week_number === weekNumber) {
      rxMap.set(rx.plan_exercise_id, rx);
    }
  }

  // Group exercises by section, preserving order
  const steps: WorkoutStep[] = [];
  let sectionIndex = 0;

  for (const section of SECTION_ORDER) {
    const sectionExercises = dayExercises.filter((e) => e.section === section);
    if (sectionExercises.length === 0) continue;

    // Identify superset groups and solo exercises
    const groups: { group: string | null; exercises: PlanExercise[] }[] = [];
    let currentGroup: { group: string | null; exercises: PlanExercise[] } | null =
      null;

    for (const ex of sectionExercises) {
      const g = ex.superset_group || null;
      if (g && currentGroup && currentGroup.group === g) {
        currentGroup.exercises.push(ex);
      } else {
        currentGroup = { group: g, exercises: [ex] };
        groups.push(currentGroup);
      }
    }

    for (const { group, exercises: groupExs } of groups) {
      if (group && groupExs.length > 1) {
        // Superset: alternating flow
        const maxSets = Math.max(
          ...groupExs.map((e) => rxMap.get(e.id)?.sets ?? 1)
        );
        const restSeconds = Math.max(
          ...groupExs.map((e) => rxMap.get(e.id)?.rest_seconds ?? 0)
        );

        for (let setIdx = 0; setIdx < maxSets; setIdx++) {
          // All exercises in round
          for (const ex of groupExs) {
            const rx = rxMap.get(ex.id);
            if (!rx || setIdx >= (rx.sets ?? 1)) continue;
            steps.push({
              type: "exercise",
              planExerciseId: ex.id,
              exercise: ex,
              prescription: rx,
              setNumber: setIdx + 1,
              totalSets: rx.sets ?? 1,
              supersetGroup: group,
              sectionIndex,
              groupLabel: group,
            });
          }
          // Rest after each round except last
          if (setIdx < maxSets - 1 && restSeconds > 0) {
            steps.push({
              type: "rest",
              restSeconds,
              sectionIndex,
              groupLabel: group,
            });
          }
        }
      } else {
        // Solo exercise (or single-exercise "group")
        const ex = groupExs[0];
        const rx = rxMap.get(ex.id);
        const sets = rx?.sets ?? 1;
        const restSeconds = rx?.rest_seconds ?? 0;

        for (let setIdx = 0; setIdx < sets; setIdx++) {
          steps.push({
            type: "exercise",
            planExerciseId: ex.id,
            exercise: ex,
            prescription: rx,
            setNumber: setIdx + 1,
            totalSets: sets,
            supersetGroup: null,
            sectionIndex,
            groupLabel: ex.exercise.name,
          });
          // Rest between sets (not after last set)
          if (setIdx < sets - 1 && restSeconds > 0) {
            steps.push({
              type: "rest",
              restSeconds,
              sectionIndex,
              groupLabel: ex.exercise.name,
            });
          }
        }
      }
      sectionIndex++;
    }
  }

  return steps;
}

/**
 * Get the list of days that have exercises in the plan.
 */
export function getAvailableDays(exercises: PlanExercise[]): number[] {
  const days = new Set(exercises.map((e) => e.day_number));
  return [...days].sort((a, b) => a - b);
}

/**
 * Format prescription text for display.
 * e.g. "4 × 8-12 reps · RIR 2 · 3-1-X-0 · 80kg"
 */
export function formatPrescription(rx: Prescription): string {
  const parts: string[] = [];

  // Sets × Reps/Duration
  const sets = rx.sets ?? 1;
  if (rx.prescription_type === "duration" && rx.duration_seconds) {
    parts.push(`${sets} × ${rx.duration_seconds}s`);
  } else if (rx.reps_min && rx.reps_max) {
    parts.push(`${sets} × ${rx.reps_min}-${rx.reps_max}`);
  } else if (rx.reps) {
    parts.push(`${sets} × ${rx.reps}`);
  }

  // RIR (only if prescribed)
  if (rx.rir != null) {
    parts.push(`RIR ${rx.rir}`);
  }

  // Tempo
  if (rx.tempo) {
    parts.push(rx.tempo);
  }

  // Method (only if not standard)
  if (rx.method && rx.method !== "standard") {
    parts.push(rx.method.replace(/_/g, " ").toUpperCase());
  }

  // Load
  if (rx.loadKg != null) {
    parts.push(`${rx.loadKg}kg`);
  } else if (rx.rmPercent != null) {
    parts.push(`${Math.round(rx.rmPercent * 100)}% RM`);
  }

  return parts.join(" · ");
}
