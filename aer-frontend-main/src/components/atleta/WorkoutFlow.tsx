import { useState, useRef, useCallback, useEffect } from "react";
import type { WorkoutStep, LogSet, WorkoutSession } from "@/types/strength";
import TopBar from "./TopBar";
import ExerciseScreen, { type SetData } from "./ExerciseScreen";
import { RestTimerScreen } from "./RestTimer";
import { useRestTimer } from "./RestTimer";
import {
  submitSets,
  startSession,
  finishSession,
  cancelSession,
} from "@/services/athlete-strength";
import {
  saveWorkoutState,
  clearWorkoutState,
  type SavedWorkoutState,
} from "@/lib/workout-storage";
import { getPendingCount, subscribe } from "@/lib/offline-queue";

interface Props {
  steps: WorkoutStep[];
  planId: string;
  weekNumber: number;
  dayNumber: number;
  existingLogs: LogSet[];
  onComplete: (session: WorkoutSession, loggedSets: SetData[]) => void;
  onExit: () => void;
  resumeState?: SavedWorkoutState;
}

export default function WorkoutFlow({
  steps,
  planId,
  weekNumber,
  dayNumber,
  existingLogs,
  onComplete,
  onExit,
  resumeState,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(
    resumeState?.currentIndex ?? 0
  );
  const [session, setSession] = useState<WorkoutSession | null>(
    resumeState
      ? ({ id: resumeState.sessionId } as WorkoutSession)
      : null
  );
  const [loggedSets, setLoggedSets] = useState<SetData[]>(
    resumeState?.loggedSets ?? []
  );
  const [submitting, setSubmitting] = useState(false);
  const [pendingCount, setPendingCount] = useState(getPendingCount);

  // Touch tracking for swipe
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const swiping = useRef(false);

  // ── Rest timer ──
  const { timer, startTimer, skipTimer } = useRestTimer(() => {
    // Timer complete — no auto-navigation here (auto-swipe happens on START)
  });

  // ── Start session on mount (skip if resuming) ──
  useEffect(() => {
    if (resumeState) return; // Already have session from resume
    startSession({
      plan_id: planId,
      week_number: weekNumber,
      day_number: dayNumber,
    }).then((res) => {
      setSession(res.session);

      // If backend returned an existing in-progress session with sets, restore them
      if (res.resumed && res.sets && res.sets.length > 0) {
        const restored = res.sets.map((s) => ({
          planExerciseId: s.plan_exercise_id,
          setNumber: s.set_number,
          reps: s.reps ?? 0,
          loadKg: s.load_kg,
          rir: s.rir,
          durationSeconds: s.duration_seconds,
        }));
        setLoggedSets(restored);
        // Advance step index past already-completed sets
        const lastLogged = restored[restored.length - 1];
        const resumeIdx = steps.findIndex(
          (st) =>
            st.type === "exercise" &&
            st.planExerciseId === lastLogged.planExerciseId &&
            st.setNumber === lastLogged.setNumber
        );
        const nextIdx = resumeIdx >= 0 ? Math.min(resumeIdx + 1, steps.length - 1) : 0;
        goTo(nextIdx);
        saveWorkoutState({
          sessionId: res.session.id,
          planId,
          weekNumber,
          dayNumber,
          currentIndex: nextIdx,
          loggedSets: restored,
          startedAt: res.session.started_at,
        });
      } else {
        saveWorkoutState({
          sessionId: res.session.id,
          planId,
          weekNumber,
          dayNumber,
          currentIndex: 0,
          loggedSets: [],
          startedAt: new Date().toISOString(),
        });
      }
    });
  }, [planId, weekNumber, dayNumber, resumeState]);

  // ── Persist state to localStorage on changes ──
  useEffect(() => {
    if (!session) return;
    saveWorkoutState({
      sessionId: session.id,
      planId,
      weekNumber,
      dayNumber,
      currentIndex,
      loggedSets,
      startedAt: resumeState?.startedAt ?? new Date().toISOString(),
    });
  }, [currentIndex, loggedSets, session, planId, weekNumber, dayNumber, resumeState]);

  // ── Offline queue pending count ──
  useEffect(() => {
    return subscribe(setPendingCount);
  }, []);

  // ── Navigation protection (beforeunload) ──
  useEffect(() => {
    if (!session) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [session]);

  // ── Navigation ──
  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= steps.length) return;
      setCurrentIndex(index);
    },
    [steps.length]
  );

  const goNext = useCallback(() => {
    if (currentIndex < steps.length - 1) {
      goTo(currentIndex + 1);
    } else {
      // Last step — finish workout
      handleFinish();
    }
  }, [currentIndex, steps.length, goTo]);

  // ── Set submission ──
  const handleSetSubmit = useCallback(
    async (data: SetData) => {
      setLoggedSets((prev) => [...prev, data]);

      // Submit to backend
      setSubmitting(true);
      try {
        await submitSets({
          plan_id: planId,
          session_id: session?.id,
          sets: [
            {
              plan_exercise_id: data.planExerciseId,
              week_number: weekNumber,
              day_number: dayNumber,
              set_number: data.setNumber,
              reps: data.reps,
              load_kg: data.loadKg,
              rir: data.rir,
              duration_seconds: data.durationSeconds,
            },
          ],
        });
      } catch {
        // Continue even if submission fails — we can retry later
      } finally {
        setSubmitting(false);
      }

      // Check next step for rest timer
      const nextStep = steps[currentIndex + 1];
      if (nextStep?.type === "rest" && nextStep.restSeconds) {
        // Start timer and auto-swipe IMMEDIATELY (skip over the rest screen to next exercise)
        startTimer(nextStep.restSeconds);
        // Auto-swipe past the rest step to the next exercise
        const afterRestIndex = currentIndex + 2;
        if (afterRestIndex < steps.length) {
          goTo(afterRestIndex);
        } else {
          goNext();
        }
      } else {
        // No rest step next — just advance
        goNext();
      }
    },
    [planId, session, weekNumber, dayNumber, currentIndex, steps, startTimer, goTo, goNext]
  );

  // ── Finish workout ──
  const handleFinish = useCallback(async () => {
    if (!session) return;
    clearWorkoutState();
    try {
      const res = await finishSession(session.id);
      onComplete(res.session, loggedSets);
    } catch {
      onComplete(session, loggedSets);
    }
  }, [session, onComplete, loggedSets]);

  const handleExit = useCallback(async () => {
    if (session) {
      if (loggedSets.length > 0) {
        const shouldExit = window.confirm(
          `Tens ${loggedSets.length} sets registados. Sair cancela esta sessão.`
        );
        if (!shouldExit) return;
      }

      try {
        await cancelSession(session.id);
      } catch {
        // Ignore cancel errors and allow user to exit.
      }
    }
    clearWorkoutState();
    onExit();
  }, [session, loggedSets, onExit]);

  // ── Timer skip ──
  const handleSkipTimer = useCallback(() => {
    skipTimer();
  }, [skipTimer]);

  // ── Touch swipe handling ──
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    swiping.current = true;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!swiping.current) return;
    swiping.current = false;
    const threshold = 60;
    if (touchDeltaX.current < -threshold) {
      // Swipe left → next
      goNext();
    } else if (touchDeltaX.current > threshold && currentIndex > 0) {
      // Swipe right → previous
      goTo(currentIndex - 1);
    }
  }, [goNext, goTo, currentIndex]);

  // ── Get previous load for current exercise ──
  const getPreviousLoad = (step: WorkoutStep): { load: number; reps: number | null; suggestIncrease: boolean } | null => {
    if (!step.planExerciseId) return null;
    // Check logged sets from this session first
    const sessionLog = loggedSets
      .filter((s) => s.planExerciseId === step.planExerciseId)
      .pop();
    if (sessionLog?.loadKg) return { load: sessionLog.loadKg, reps: sessionLog.reps ?? null, suggestIncrease: false };
    // Then check existing logs
    const existing = existingLogs
      .filter((l) => l.plan_exercise_id === step.planExerciseId)
      .sort(
        (a, b) =>
          new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      )[0];
    if (!existing?.load_kg) return null;

    // Check if athlete should increase load: hit top of rep range with RIR ≤ 2
    let suggestIncrease = false;
    const rx = step.prescription;
    if (rx && existing.reps != null && existing.rir != null && existing.rir <= 2) {
      if (rx.reps_max && existing.reps >= rx.reps_max) {
        suggestIncrease = true;
      } else if (rx.reps && !rx.reps_max && existing.reps >= rx.reps) {
        suggestIncrease = true;
      }
    }

    return { load: existing.load_kg, reps: existing.reps ?? null, suggestIncrease };
  };

  const currentStep = steps[currentIndex];
  if (!currentStep) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#0a0a0f]">
      <TopBar
        steps={steps}
        currentIndex={currentIndex}
        timer={timer}
        onSkipTimer={handleSkipTimer}
        onExit={handleExit}
        pendingCount={pendingCount}
      />

      {/* Main content area with padding for top bar */}
      <div
        className="flex flex-1 flex-col overflow-y-auto pt-20"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {currentStep.type === "exercise" ? (
          <ExerciseScreen
            key={`${currentStep.planExerciseId}-${currentStep.setNumber}`}
            step={currentStep}
            previousLoad={getPreviousLoad(currentStep)}
            onSubmitSet={handleSetSubmit}
          />
        ) : (
          <RestTimerScreen
            remaining={timer.remaining}
            total={timer.total}
            onSkip={handleSkipTimer}
          />
        )}
      </div>

      {/* Submitting indicator */}
      {submitting && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/60">
          A guardar...
        </div>
      )}
    </div>
  );
}
