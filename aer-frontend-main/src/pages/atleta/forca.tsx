import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  AthletePlanResponse,
  WorkoutSession,
  LogSet,
} from "@/types/strength";
import { buildStepQueue, getAvailableDays } from "@/lib/workout-engine";
import { fetchAthletePlan, cancelSession } from "@/services/athlete-strength";
import {
  loadWorkoutState,
  clearWorkoutState,
  type SavedWorkoutState,
} from "@/lib/workout-storage";
import { useBottomNav } from "@/contexts/BottomNavContext";
import WorkoutFlow from "@/components/atleta/WorkoutFlow";
import QuickModeView from "@/components/atleta/QuickModeView";
import CompletionScreen from "@/components/atleta/CompletionScreen";
import SessionHistory from "@/components/atleta/SessionHistory";
import type { SetData } from "@/components/atleta/ExerciseScreen";

type View = "plan" | "workout" | "complete" | "history";

export default function ForcaPage() {
  return <ForcaContent />;
}

function ForcaContent() {
  const [searchParams] = useSearchParams();
  const instanceId = searchParams.get("instanceId") || undefined;
  const requestedWeek = Number(searchParams.get("week") || 0);
  const requestedDay = Number(searchParams.get("day") || 0);
  const { setVisible: setNavVisible } = useBottomNav();

  const [data, setData] = useState<AthletePlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState<number>(requestedDay >= 1 ? requestedDay : 1);
  const [view, setView] = useState<View>("plan");
  const [completedSession, setCompletedSession] =
    useState<WorkoutSession | null>(null);
  const [completedLoggedSets, setCompletedLoggedSets] = useState<SetData[]>([]);
  const [savedWorkout, setSavedWorkout] = useState<SavedWorkoutState | null>(
    null
  );

  // Hide bottom nav during workout/completion, show on plan/history
  useEffect(() => {
    setNavVisible(view === "plan" || view === "history");
    return () => setNavVisible(true);
  }, [view, setNavVisible]);

  // Check for interrupted workout on mount
  useEffect(() => {
    const saved = loadWorkoutState();
    if (saved) setSavedWorkout(saved);
  }, []);

  // Fetch plan
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAthletePlan(requestedWeek >= 1 ? requestedWeek : undefined, instanceId);
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar plano");
    } finally {
      setLoading(false);
    }
  }, [instanceId, requestedWeek]);

  useEffect(() => {
    load();
  }, [load]);

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
        loggedSets={completedLoggedSets}
        onClose={() => {
          setView("plan");
          setCompletedSession(null);
          setCompletedLoggedSets([]);
          load();
        }}
      />
    );
  }

  // ── Active plan ──
  const { plan, exercises, prescriptions, logs, phaseNotes } = data;
  const currentWeek = requestedWeek >= 1 ? requestedWeek : (plan.current_week || 1);
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
    currentWeek
  );

  const handleResume = () => {
    if (!savedWorkout) return;
    setSelectedDay(savedWorkout.dayNumber);
    setView("workout");
  };

  const handleDiscard = () => {
    if (!savedWorkout) return;
    clearWorkoutState();
    cancelSession(savedWorkout.sessionId).catch(() => {});
    setSavedWorkout(null);
  };

  const handleComplete = (session: WorkoutSession, loggedSets: SetData[]) => {
    setCompletedSession(session);
    setCompletedLoggedSets(loggedSets);
    setView("complete");
  };

  // ── Workout flow (fullscreen) ──
  if (view === "workout") {
    // Quick mode — simplified checklist UI
    if (plan.quick_mode) {
      return (
        <QuickModeView
          exercises={exercises}
          prescriptions={prescriptions ?? []}
          planId={plan.id}
          weekNumber={currentWeek}
          dayNumber={selectedDay}
          onComplete={(session) => {
            setCompletedSession(session);
            setCompletedLoggedSets([]);
            setView("complete");
          }}
          onExit={() => setView("plan")}
        />
      );
    }

    const isResuming =
      savedWorkout &&
      savedWorkout.planId === plan.id &&
      savedWorkout.weekNumber === currentWeek &&
      savedWorkout.dayNumber === selectedDay;

    const activeSteps = isResuming
      ? buildStepQueue(
          exercises,
          prescriptions ?? [],
          savedWorkout.dayNumber,
          savedWorkout.weekNumber
        )
      : steps;

    return (
      <WorkoutFlow
        steps={activeSteps}
        planId={plan.id}
        weekNumber={currentWeek}
        dayNumber={selectedDay}
        existingLogs={(logs as LogSet[]) ?? []}
        onComplete={handleComplete}
        onExit={() => {
          setSavedWorkout(null);
          setView("plan");
        }}
        resumeState={isResuming ? savedWorkout : undefined}
      />
    );
  }

  // ── Plan overview / day selector ──
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(212,165,79,0.14),#1a1a1a_46%,#090909)] px-4 pb-10 pt-14 safe-area-top">
      {/* Resume interrupted workout dialog */}
      {savedWorkout &&
        savedWorkout.planId === plan.id &&
        savedWorkout.weekNumber === currentWeek && (
          <div className="mb-6 rounded-2xl border border-[#d4a54f66] bg-[#171717] p-5">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <h3 className="font-['Oswald'] text-lg font-bold text-[#f7f1e8]">
                Treino em curso
              </h3>
            </div>
            <p className="mb-4 text-sm text-[#8f99a8]">
              Dia {savedWorkout.dayNumber} · Semana {savedWorkout.weekNumber} ·{" "}
              {savedWorkout.loggedSets.length} set
              {savedWorkout.loggedSets.length !== 1 ? "s" : ""} registado
              {savedWorkout.loggedSets.length !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleResume}
                className="flex-1 rounded-xl border border-[#d4a54f66] bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] py-2.5 font-['Oswald'] text-sm font-semibold text-[#111111] active:scale-[0.98]"
              >
                Continuar
              </button>
              <button
                onClick={handleDiscard}
                className="flex-1 rounded-xl border border-[#d4a54f22] bg-[#232323] py-2.5 font-['Oswald'] text-sm font-semibold text-[#8f99a8] active:bg-[#2a2a2a]"
              >
                Descartar
              </button>
            </div>
          </div>
        )}

      {/* Header */}
      <div className="mb-6 text-center">
        <h1 className="font-['Oswald'] text-3xl font-bold text-[#f7f1e8]">
          {plan.name}
        </h1>
        {plan.description && (
          <p className="mt-1 text-sm text-[#8f99a8]">{plan.description}</p>
        )}
        <div className="mt-3 inline-flex rounded-full border border-[#d4a54f44] bg-[#171717] px-4 py-1.5 text-[11px] uppercase tracking-widest text-[#d4a54f]">
          Semana {currentWeek}/{plan.total_weeks}
        </div>
      </div>

      {/* Tab toggle: Plano / Histórico */}
      <div className="mb-5 flex justify-center">
        <div className="inline-flex rounded-full border border-[#d4a54f22] bg-[#171717] p-0.5">
          {(["plan", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setView(t)}
              className={`rounded-full px-5 py-1.5 text-xs font-semibold transition-colors ${
                view === t
                  ? "bg-[#d4a54f] text-[#111111]"
                  : "text-[#8f99a8]"
              }`}
            >
              {t === "plan" ? "Plano" : "Histórico"}
            </button>
          ))}
        </div>
      </div>

      {/* History view */}
      {view === "history" && (
        <SessionHistory planId={plan.id} exercises={exercises} />
      )}

      {/* Plan view content */}
      {view === "plan" && <>
      {/* Day selector */}
      <div className="mb-6">
        <label className="mb-2 block text-center text-[10px] uppercase tracking-wider text-[#8f99a8]">
          Dia
        </label>
        <div className="flex justify-center gap-2 overflow-x-auto pb-1">
          {availableDays.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors ${
                d === selectedDay
                  ? "bg-[#d4a54f] text-[#111111]"
                  : "border border-[#d4a54f22] bg-[#171717] text-[#c8cfda] active:bg-[#232323]"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Coach notes for this day/week */}
      {phaseNotes && phaseNotes
        .filter((n) => n.day_number === selectedDay && n.week_number === currentWeek)
        .map((n) => (
          <div
            key={n.id}
            className="mb-4 rounded-2xl border border-[#d4a54f44] bg-[#171717] px-4 py-3"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs">📝</span>
              <span className="text-[10px] uppercase tracking-wider text-[#d4a54f]">
                Nota do coach
              </span>
            </div>
            <p className="whitespace-pre-line text-sm text-[#c8cfda]">{n.notes}</p>
          </div>
        ))
      }

      {/* Exercise preview list */}
      <div className="mb-6 space-y-2">
        {exercises
          .filter((e) => e.day_number === selectedDay)
          .sort((a, b) => a.exercise_order - b.exercise_order)
          .map((ex) => {
            const rx = prescriptions?.find(
              (p) =>
                p.plan_exercise_id === ex.id &&
                p.week_number === currentWeek
            );
            return (
              <div
                key={ex.id}
                className="flex items-center gap-3 rounded-2xl border border-[#d4a54f22] bg-[#171717] px-4 py-3"
              >
                {ex.superset_group && (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#d4a54f22] text-xs font-bold text-[#d4a54f]">
                    {ex.superset_group}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-['Oswald'] text-base font-medium text-[#f7f1e8]">
                    {ex.exercise.name}
                  </p>
                  {rx && (
                    <p className="mt-0.5 truncate text-xs text-[#8f99a8]">
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
                    className="shrink-0 text-[#d4a54f]/70"
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
          className="w-full rounded-2xl border border-[#d4a54f66] bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] py-4 font-['Oswald'] text-lg font-semibold text-[#111111] shadow-lg shadow-[#00000066] active:scale-[0.98] disabled:opacity-40"
        >
          Iniciar treino
        </button>
      </div>
      </>}
    </div>
  );
}
