import { useState, useEffect, useCallback } from "react";
import type {
  AthletePlanResponse,
  WorkoutSession,
  LogSet,
} from "@/types/strength";
import { buildStepQueue, getAvailableDays } from "@/lib/workout-engine";
import { fetchAthletePlan } from "@/services/athlete-strength";
import AthleteAuthGuard from "@/components/atleta/AthleteAuthGuard";
import WorkoutFlow from "@/components/atleta/WorkoutFlow";
import QuickModeView from "@/components/atleta/QuickModeView";
import CompletionScreen from "@/components/atleta/CompletionScreen";

type View = "plan" | "workout" | "quick" | "complete";

export default function ForcaPage() {
  return (
    <AthleteAuthGuard>
      {() => <ForcaContent />}
    </AthleteAuthGuard>
  );
}

function ForcaContent() {
  const [data, setData] = useState<AthletePlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [view, setView] = useState<View>("plan");
  const [completedSession, setCompletedSession] =
    useState<WorkoutSession | null>(null);

  // Fetch plan
  const load = useCallback(async (week?: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAthletePlan(week);
      setData(res);
      if (res.plan) {
        setSelectedWeek(res.plan.current_week || 1);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar plano");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch when week changes
  useEffect(() => {
    if (data?.plan && selectedWeek !== data.plan.current_week) {
      load(selectedWeek);
    }
  }, [selectedWeek]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0f] px-6">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={() => load()}
          className="rounded-lg bg-white/10 px-6 py-2 text-sm text-white active:bg-white/20"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // ── Pending athlete ──
  if (data?.status === "pending") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0f] px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-600/20">
          <span className="text-2xl">⏳</span>
        </div>
        <h2 className="font-['Oswald'] text-xl font-bold text-white">
          Bem-vindo!
        </h2>
        <p className="text-sm text-white/60">
          {data.message || "O teu coach vai ativar a tua conta em breve."}
        </p>
      </div>
    );
  }

  // ── No plan ──
  if (data?.status === "no_plan" || !data?.plan || !data?.exercises) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0f] px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
          <span className="text-2xl">📋</span>
        </div>
        <h2 className="font-['Oswald'] text-xl font-bold text-white">
          Sem plano ativo
        </h2>
        <p className="text-sm text-white/60">
          Ainda não tens um plano de treino atribuído.
        </p>
      </div>
    );
  }

  // ── Completion screen ──
  if (view === "complete" && completedSession) {
    return (
      <CompletionScreen
        session={completedSession}
        loggedSets={[]}
        onClose={() => {
          setView("plan");
          setCompletedSession(null);
          load(selectedWeek);
        }}
      />
    );
  }

  // ── Active plan ──
  const { plan, exercises, prescriptions, logs } = data;
  const availableDays = getAvailableDays(exercises);

  // Ensure selected day is valid
  if (!availableDays.includes(selectedDay) && availableDays.length > 0) {
    setSelectedDay(availableDays[0]);
    return null;
  }

  const steps = buildStepQueue(
    exercises,
    prescriptions ?? [],
    selectedDay,
    selectedWeek
  );

  const handleComplete = (session: WorkoutSession) => {
    setCompletedSession(session);
    setView("complete");
  };

  // ── Workout flow (fullscreen) ──
  if (view === "workout") {
    return (
      <WorkoutFlow
        steps={steps}
        planId={plan.id}
        weekNumber={selectedWeek}
        dayNumber={selectedDay}
        existingLogs={(logs as LogSet[]) ?? []}
        onComplete={handleComplete}
        onExit={() => setView("plan")}
      />
    );
  }

  // ── Quick mode (fullscreen) ──
  if (view === "quick") {
    return (
      <QuickModeView
        exercises={exercises}
        prescriptions={prescriptions ?? []}
        planId={plan.id}
        weekNumber={selectedWeek}
        dayNumber={selectedDay}
        onComplete={handleComplete}
        onExit={() => setView("plan")}
      />
    );
  }

  // ── Plan overview / day selector ──
  return (
    <div className="min-h-screen bg-[#0a0a0f] px-4 pb-10 pt-14 safe-area-top">
      {/* Header */}
      <div className="mb-6 text-center">
        <h1 className="font-['Oswald'] text-2xl font-bold text-white">
          {plan.name}
        </h1>
        {plan.description && (
          <p className="mt-1 text-xs text-white/50">{plan.description}</p>
        )}
      </div>

      {/* Week selector */}
      <div className="mb-6">
        <label className="mb-2 block text-center text-[10px] uppercase tracking-wider text-white/40">
          Semana
        </label>
        <div className="flex justify-center gap-2 overflow-x-auto pb-1">
          {Array.from({ length: plan.total_weeks }, (_, i) => i + 1).map(
            (w) => (
              <button
                key={w}
                onClick={() => setSelectedWeek(w)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  w === selectedWeek
                    ? "bg-orange-600 text-white"
                    : "bg-white/5 text-white/60 active:bg-white/10"
                }`}
              >
                {w}
              </button>
            )
          )}
        </div>
      </div>

      {/* Day selector */}
      <div className="mb-6">
        <label className="mb-2 block text-center text-[10px] uppercase tracking-wider text-white/40">
          Dia
        </label>
        <div className="flex justify-center gap-2 overflow-x-auto pb-1">
          {availableDays.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors ${
                d === selectedDay
                  ? "bg-orange-600 text-white"
                  : "bg-white/5 text-white/60 active:bg-white/10"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Exercise preview list */}
      <div className="mb-6 space-y-2">
        {exercises
          .filter((e) => e.day_number === selectedDay)
          .sort((a, b) => a.exercise_order - b.exercise_order)
          .map((ex) => {
            const rx = prescriptions?.find(
              (p) =>
                p.plan_exercise_id === ex.id &&
                p.week_number === selectedWeek
            );
            return (
              <div
                key={ex.id}
                className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3"
              >
                {ex.superset_group && (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-600/20 text-xs font-bold text-orange-400">
                    {ex.superset_group}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {ex.exercise.name}
                  </p>
                  {rx && (
                    <p className="mt-0.5 truncate text-xs text-white/40">
                      {rx.sets} × {rx.reps_min && rx.reps_max ? `${rx.reps_min}-${rx.reps_max}` : rx.reps ?? "—"}{" "}
                      {rx.loadKg ? `· ${rx.loadKg}kg` : ""}
                    </p>
                  )}
                </div>
                {ex.exercise.video_url && (
                  <a
                    href={ex.exercise.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-orange-400/60"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </a>
                )}
              </div>
            );
          })}
      </div>

      {/* Start buttons */}
      <div className="space-y-3">
        <button
          onClick={() => setView("workout")}
          disabled={steps.length === 0}
          className="w-full rounded-xl bg-orange-600 py-4 font-['Oswald'] text-lg font-semibold text-white shadow-lg shadow-orange-600/20 active:scale-[0.98] active:bg-orange-700 disabled:opacity-40"
        >
          Iniciar treino
        </button>

        {plan.quick_mode && (
          <button
            onClick={() => setView("quick")}
            className="w-full rounded-xl bg-white/5 py-3.5 text-sm font-medium text-white/70 active:bg-white/10"
          >
            Modo rápido ⚡
          </button>
        )}
      </div>
    </div>
  );
}
