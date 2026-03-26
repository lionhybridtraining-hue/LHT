import type { WorkoutStep } from "@/types/strength";
import type { TimerState } from "./RestTimer";
import { RestTimerBadge } from "./RestTimer";

interface Props {
  steps: WorkoutStep[];
  currentIndex: number;
  timer: TimerState;
  onSkipTimer: () => void;
  onExit: () => void;
  pendingCount?: number;
}

const SECTION_LABELS: Record<string, string> = {
  warm_up: "Aquecimento",
  plyos_speed: "Pliometria",
  main: "Principal",
  conditioning: "Condicionamento",
  observations: "Observações",
};

export default function TopBar({
  steps,
  currentIndex,
  timer,
  onSkipTimer,
  onExit,
  pendingCount,
}: Props) {
  const current = steps[currentIndex];
  if (!current) return null;

  const exerciseName =
    current.type === "exercise"
      ? current.exercise?.exercise.name ?? ""
      : "Descanso";

  const sectionName =
    current.type === "exercise"
      ? SECTION_LABELS[current.exercise?.section ?? ""] ?? ""
      : "";

  const setLabel =
    current.type === "exercise" && current.setNumber && current.totalSets
      ? `Set ${current.setNumber}/${current.totalSets}`
      : "";

  // Progress bar
  const progress = steps.length > 0 ? ((currentIndex + 1) / steps.length) * 100 : 0;

  return (
    <div className="fixed top-0 right-0 left-0 z-50 border-b border-[#d4a54f22] bg-[#0a0a0f]/95 backdrop-blur-sm safe-area-top">
      <div className="h-0.5 w-full bg-white/10">
        <div
          className="h-full bg-[#d4a54f] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          onClick={onExit}
          className="shrink-0 text-[#8f99a8] transition-colors active:text-white"
          aria-label="Sair"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
          {sectionName && (
            <span className="text-[10px] uppercase tracking-widest text-[#d4a54f]">
              {sectionName}
            </span>
          )}
          <span className="max-w-full truncate font-['Oswald'] text-base font-medium text-[#f7f1e8]">
            {current.supersetGroup
              ? `${current.supersetGroup} · ${exerciseName}`
              : exerciseName}
          </span>
          {setLabel && (
            <span className="text-[10px] text-[#8f99a8]">{setLabel}</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Sync status indicator */}
          {pendingCount !== undefined && (
            <span
              className={`flex h-6 items-center rounded-full px-2 text-[10px] font-semibold ${
                pendingCount > 0
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-emerald-500/20 text-emerald-400"
              }`}
            >
              {pendingCount > 0 ? `${pendingCount} ⏳` : "✓"}
            </span>
          )}
          <RestTimerBadge
            remaining={timer.remaining}
            total={timer.total}
            running={timer.running}
            onSkip={onSkipTimer}
          />
        </div>
      </div>
    </div>
  );
}
