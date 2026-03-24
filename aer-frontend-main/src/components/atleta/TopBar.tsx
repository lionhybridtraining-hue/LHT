import { useState } from "react";
import type { WorkoutStep } from "@/types/strength";
import type { TimerState } from "./RestTimer";
import { RestTimerBadge } from "./RestTimer";

interface Props {
  steps: WorkoutStep[];
  currentIndex: number;
  timer: TimerState;
  onSkipTimer: () => void;
  onNavigate: (index: number) => void;
  onExit: () => void;
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
  onNavigate,
  onExit,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Build navigation hierarchy for dropdown
  const navGroups = buildNavGroups(steps);

  return (
    <>
      {/* Fixed top bar */}
      <div className="fixed top-0 right-0 left-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-sm safe-area-top">
        {/* Progress bar */}
        <div className="h-0.5 w-full bg-white/10">
          <div
            className="h-full bg-orange-500 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5">
          {/* Back / exit */}
          <button
            onClick={onExit}
            className="shrink-0 text-white/70 active:text-white"
            aria-label="Sair"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Center info — tap to open nav */}
          <button
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
            onClick={() => setMenuOpen(true)}
          >
            {sectionName && (
              <span className="text-[10px] uppercase tracking-wider text-orange-400">
                {sectionName}
              </span>
            )}
            <span className="max-w-full truncate text-sm font-semibold text-white">
              {current.supersetGroup
                ? `${current.supersetGroup} · ${exerciseName}`
                : exerciseName}
            </span>
            {setLabel && (
              <span className="text-[10px] text-white/50">{setLabel}</span>
            )}
          </button>

          {/* Timer badge */}
          <div className="shrink-0">
            <RestTimerBadge
              remaining={timer.remaining}
              total={timer.total}
              running={timer.running}
              onSkip={onSkipTimer}
            />
          </div>
        </div>
      </div>

      {/* Navigation dropdown */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="max-h-[80vh] overflow-y-auto rounded-b-2xl bg-[#141420] px-4 pb-6 pt-14 safe-area-top"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-center font-['Oswald'] text-sm uppercase tracking-wider text-white/60">
              Navegação
            </h3>

            {navGroups.map((group) => (
              <div key={group.key} className="mb-3">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-orange-400/80">
                  {group.sectionLabel}
                </p>
                {group.items.map((item) => {
                  const isActive = item.stepIndexes.includes(currentIndex);
                  return (
                    <button
                      key={item.key}
                      className={`mb-0.5 w-full rounded-lg px-3 py-2 text-left text-sm ${
                        isActive
                          ? "bg-orange-600/20 text-orange-300"
                          : "text-white/80 active:bg-white/5"
                      }`}
                      onClick={() => {
                        onNavigate(item.stepIndexes[0]);
                        setMenuOpen(false);
                      }}
                    >
                      <span className="font-medium">{item.label}</span>
                      {item.detail && (
                        <span className="ml-2 text-xs text-white/40">{item.detail}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            <button
              onClick={() => setMenuOpen(false)}
              className="mt-2 w-full rounded-lg bg-white/5 py-2.5 text-sm text-white/60 active:bg-white/10"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Nav group builder ──

interface NavItem {
  key: string;
  label: string;
  detail: string;
  stepIndexes: number[];
}

interface NavGroup {
  key: string;
  sectionLabel: string;
  items: NavItem[];
}

function buildNavGroups(steps: WorkoutStep[]): NavGroup[] {
  const groups: NavGroup[] = [];
  let lastGroupKey = "";

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type !== "exercise") continue;

    const section = step.exercise?.section ?? "main";
    const sectionLabel = SECTION_LABELS[section] ?? section;
    const exerciseName = step.exercise?.exercise.name ?? "";
    const groupKey = `${section}:${step.supersetGroup ?? step.planExerciseId}`;

    if (groupKey === lastGroupKey) {
      // Add to existing group's last item
      const lastItem = groups[groups.length - 1]?.items;
      if (lastItem?.length) {
        lastItem[lastItem.length - 1].stepIndexes.push(i);
      }
      continue;
    }

    lastGroupKey = groupKey;

    // Find or create section group
    let sGroup = groups.find((g) => g.key === section);
    if (!sGroup) {
      sGroup = { key: section, sectionLabel, items: [] };
      groups.push(sGroup);
    }

    const label = step.supersetGroup
      ? `${step.supersetGroup} · ${exerciseName}`
      : exerciseName;

    sGroup.items.push({
      key: groupKey + i,
      label,
      detail: `${step.totalSets ?? 1} sets`,
      stepIndexes: [i],
    });
  }

  return groups;
}
