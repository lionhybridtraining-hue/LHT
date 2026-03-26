import { useEffect, useRef, useCallback, useState } from "react";

export interface TimerState {
  /** Whether the timer is currently running */
  running: boolean;
  /** Seconds remaining (counts down from total) */
  remaining: number;
  /** Total seconds for this timer cycle */
  total: number;
}

/**
 * Hook that manages a countdown rest timer.
 * Returns state + controls.
 */
export function useRestTimer(onComplete?: () => void) {
  const [state, setState] = useState<TimerState>({
    running: false,
    remaining: 0,
    total: 0,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clear = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(
    (seconds: number) => {
      clear();
      setState({ running: true, remaining: seconds, total: seconds });

      intervalRef.current = setInterval(() => {
        setState((prev) => {
          if (prev.remaining <= 1) {
            clear();
            // Vibrate on completion if available
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            onCompleteRef.current?.();
            return { running: false, remaining: 0, total: prev.total };
          }
          return { ...prev, remaining: prev.remaining - 1 };
        });
      }, 1000);
    },
    [clear]
  );

  const stop = useCallback(() => {
    clear();
    setState((prev) => ({ ...prev, running: false }));
  }, [clear]);

  const skip = useCallback(() => {
    clear();
    setState({ running: false, remaining: 0, total: 0 });
  }, [clear]);

  useEffect(() => clear, [clear]);

  return { timer: state, startTimer: start, stopTimer: stop, skipTimer: skip };
}

/**
 * Inline timer display component (compact, for top bar).
 */
export function RestTimerBadge({
  remaining,
  total,
  running,
  onSkip,
}: {
  remaining: number;
  total: number;
  running: boolean;
  onSkip?: () => void;
}) {
  if (!running && remaining === 0) return null;

  const pct = total > 0 ? ((total - remaining) / total) * 100 : 0;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const display = mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}s`;

  return (
    <button
      onClick={onSkip}
      className="relative flex items-center gap-1.5 rounded-full bg-[#d4a54f] px-3 py-1 text-xs font-bold text-[#111111] active:brightness-95"
      aria-label="Saltar descanso"
    >
      {/* Progress ring */}
      <svg className="h-4 w-4 -rotate-90" viewBox="0 0 20 20">
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="2"
        />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="#111111"
          strokeWidth="2"
          strokeDasharray={`${(pct / 100) * 50.27} 50.27`}
          strokeLinecap="round"
        />
      </svg>
      <span>{display}</span>
    </button>
  );
}

/**
 * Full-screen rest timer overlay (shown in the step queue).
 */
export function RestTimerScreen({
  remaining,
  total,
  onSkip,
}: {
  remaining: number;
  total: number;
  onSkip: () => void;
}) {
  const pct = total > 0 ? ((total - remaining) / total) * 100 : 0;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const display = mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}`;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
      {/* Circular progress */}
      <div className="relative flex h-48 w-48 items-center justify-center">
        <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="4"
          />
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="#d4a54f"
            strokeWidth="4"
            strokeDasharray={`${(pct / 100) * 276.46} 276.46`}
            strokeLinecap="round"
            className="transition-[stroke-dasharray] duration-1000 ease-linear"
          />
        </svg>
        <span className="font-['Oswald'] text-6xl font-bold text-[#f7f1e8] tabular-nums">
          {display}
        </span>
        {mins > 0 && (
          <span className="absolute bottom-12 text-xs text-[#8f99a8]">
            {String(secs).padStart(2, "0")}
          </span>
        )}
      </div>

      <p className="text-sm text-[#8f99a8]">Descanso</p>

      <button
        onClick={onSkip}
        className="rounded-full border border-[#d4a54f66] bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] px-8 py-3 text-sm font-semibold text-[#111111]"
      >
        Saltar ›
      </button>
    </div>
  );
}
