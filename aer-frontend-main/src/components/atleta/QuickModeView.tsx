import { useState, useCallback, useEffect } from "react";
import type { PlanExercise, Prescription, WorkoutSession } from "@/types/strength";
import { formatPrescription } from "@/lib/workout-engine";
import { startSession, finishSession, submitSets } from "@/services/athlete-strength";

interface Props {
  exercises: PlanExercise[];
  prescriptions: Prescription[];
  planId: string;
  weekNumber: number;
  dayNumber: number;
  onComplete: (session: WorkoutSession) => void;
  onExit: () => void;
}

type ExStatus = "pending" | "done" | "skipped";

export default function QuickModeView({
  exercises,
  prescriptions,
  planId,
  weekNumber,
  dayNumber,
  onComplete,
  onExit,
}: Props) {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [statuses, setStatuses] = useState<Map<string, ExStatus>>(new Map());

  const dayExercises = exercises
    .filter((e) => e.day_number === dayNumber)
    .sort((a, b) => a.exercise_order - b.exercise_order);

  const rxMap = new Map<string, Prescription>();
  for (const rx of prescriptions) {
    if (rx.week_number === weekNumber) {
      rxMap.set(rx.plan_exercise_id, rx);
    }
  }

  // Start session on mount
  useEffect(() => {
    startSession({
      plan_id: planId,
      week_number: weekNumber,
      day_number: dayNumber,
    }).then((res) => setSession(res.session));
  }, [planId, weekNumber, dayNumber]);

  const toggle = useCallback((id: string) => {
    setStatuses((prev) => {
      const next = new Map(prev);
      const current = next.get(id) ?? "pending";
      if (current === "pending") next.set(id, "done");
      else if (current === "done") next.set(id, "skipped");
      else next.set(id, "pending");
      return next;
    });
  }, []);

  const allDecided = dayExercises.every(
    (e) => statuses.get(e.id) === "done" || statuses.get(e.id) === "skipped"
  );

  const handleFinish = useCallback(async () => {
    if (!session) return;

    // Submit "done" exercises as single-set entries
    const doneExercises = dayExercises.filter(
      (e) => statuses.get(e.id) === "done"
    );
    if (doneExercises.length > 0) {
      const sets = doneExercises.map((e) => {
        const rx = rxMap.get(e.id);
        return {
          plan_exercise_id: e.id,
          week_number: weekNumber,
          day_number: dayNumber,
          set_number: 1,
          reps: rx?.reps ?? 0,
          load_kg: rx?.loadKg ?? null,
          method: "quick" as const,
        };
      });
      try {
        await submitSets({ plan_id: planId, session_id: session.id, sets });
      } catch {
        // Continue finishing even on error
      }
    }

    try {
      const res = await finishSession(session.id);
      onComplete(res.session);
    } catch {
      onComplete(session);
    }
  }, [session, dayExercises, statuses, planId, weekNumber, dayNumber, rxMap, onComplete]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-12 safe-area-top">
        <button onClick={onExit} className="text-white/70 active:text-white">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-center font-['Oswald'] text-lg font-bold text-white">
          Modo Rápido
        </h1>
        <div className="w-5" />
      </div>

      {/* Exercise list */}
      <div className="flex-1 overflow-y-auto px-4 pb-32">
        {dayExercises.map((ex) => {
          const rx = rxMap.get(ex.id);
          const status = statuses.get(ex.id) ?? "pending";
          return (
            <button
              key={ex.id}
              onClick={() => toggle(ex.id)}
              className={`mb-2 flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors ${
                status === "done"
                  ? "bg-green-600/15 ring-1 ring-green-500/30"
                  : status === "skipped"
                    ? "bg-red-600/10 ring-1 ring-red-500/20"
                    : "bg-white/5"
              }`}
            >
              {/* Status icon */}
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  status === "done"
                    ? "bg-green-500 text-white"
                    : status === "skipped"
                      ? "bg-red-500/80 text-white"
                      : "bg-white/10 text-white/40"
                }`}
              >
                {status === "done" ? "✓" : status === "skipped" ? "✗" : "·"}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-medium ${
                    status === "skipped" ? "text-white/40 line-through" : "text-white"
                  }`}
                >
                  {ex.superset_group && (
                    <span className="mr-1 text-orange-400">
                      {ex.superset_group}
                    </span>
                  )}
                  {ex.exercise.name}
                </p>
                {rx && (
                  <p className="mt-0.5 truncate text-xs text-white/40">
                    {formatPrescription(rx)}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom action */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0a0a0f]/95 px-4 pb-8 pt-3 safe-area-bottom backdrop-blur-sm">
        <button
          onClick={handleFinish}
          disabled={!allDecided}
          className={`w-full rounded-xl py-4 font-['Oswald'] text-lg font-semibold shadow-lg transition-colors ${
            allDecided
              ? "bg-orange-600 text-white shadow-orange-600/20 active:bg-orange-700"
              : "bg-white/10 text-white/30"
          }`}
        >
          Terminar treino
        </button>
        <p className="mt-2 text-center text-xs text-white/30">
          {dayExercises.filter((e) => statuses.get(e.id) === "done").length}/
          {dayExercises.length} exercícios feitos
        </p>
      </div>
    </div>
  );
}
