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
} from "@/services/athlete-strength";

interface Props {
  steps: WorkoutStep[];
  planId: string;
  weekNumber: number;
  dayNumber: number;
  existingLogs: LogSet[];
  onComplete: (session: WorkoutSession) => void;
  onExit: () => void;
}

export default function WorkoutFlow({
  steps,
  planId,
  weekNumber,
  dayNumber,
  existingLogs,
  onComplete,
  onExit,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loggedSets, setLoggedSets] = useState<SetData[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Touch tracking for swipe
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const swiping = useRef(false);

  // ── Rest timer ──
  const { timer, startTimer, skipTimer } = useRestTimer(() => {
    // Timer complete — no auto-navigation here (auto-swipe happens on START)
  });

  // ── Start session on mount ──
  useEffect(() => {
    startSession({
      plan_id: planId,
      week_number: weekNumber,
      day_number: dayNumber,
    }).then((res) => setSession(res.session));
  }, [planId, weekNumber, dayNumber]);

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
    try {
      const res = await finishSession(session.id);
      onComplete(res.session);
    } catch {
      onComplete(session);
    }
  }, [session, onComplete]);

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
  const getPreviousLoad = (step: WorkoutStep): number | null => {
    if (!step.planExerciseId) return null;
    // Check logged sets from this session first
    const sessionLog = loggedSets
      .filter((s) => s.planExerciseId === step.planExerciseId)
      .pop();
    if (sessionLog?.loadKg) return sessionLog.loadKg;
    // Then check existing logs
    const existing = existingLogs
      .filter((l) => l.plan_exercise_id === step.planExerciseId)
      .sort(
        (a, b) =>
          new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      )[0];
    return existing?.load_kg ?? null;
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
        onNavigate={goTo}
        onExit={onExit}
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
