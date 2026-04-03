import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import type { AthleteOutletContext } from "@/components/atleta/AthleteLayout";
import {
  fetchSchedulePresets,
  fetchWeeklySessions,
  fetchAthleteWeeklyPlan,
  generateWeeklyPlan,
  type SchedulePreset,
  type WeeklySession,
  type WeeklyPlanRow,
} from "@/services/athlete-schedule";
import {
  fetchMyPrograms,
  type MyProgram,
} from "@/services/athlete-my-programs";

const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const SESSION_COLORS: Record<string, string> = {
  strength: "bg-blue-900/60 border-blue-700",
  running: "bg-green-900/60 border-green-700",
  rest: "bg-zinc-800/60 border-zinc-600",
  mobility: "bg-purple-900/60 border-purple-700",
  other: "bg-zinc-700/60 border-zinc-600",
};

/** Derives the current week number based on instance start_date. */
function getCurrentWeek(startDate: string | null | undefined): number {
  if (!startDate) return 1;
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks + 1);
}

// ── Types for compiled program entries ──
interface CalendarProgram {
  id: string; // assignmentId or instanceId
  name: string;
  assignmentId: string | null;
  instanceId: string | null;
  programId: string | null;
  startDate: string | null;
  presetSelection: "coach" | "athlete";
  selectedPresetId: string | null;
  needsPresetSelection: boolean;
}

export default function CalendarioPage() {
  const { session } = useOutletContext<AthleteOutletContext>();
  return <CalendarioContent session={session} />;
}

function CalendarioContent({ session: _session }: { session: AthleteOutletContext["session"] }) {
  const navigate = useNavigate();

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [programs, setPrograms] = useState<CalendarProgram[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<CalendarProgram | null>(null);
  const [plan, setPlan] = useState<WeeklyPlanRow[]>([]);
  const [presets, setPresets] = useState<SchedulePreset[]>([]);
  const [sessions, setSessions] = useState<WeeklySession[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);

  const hasPlan = plan.length > 0;

  // ── Step 1: Load all active programs/instances ──
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchMyPrograms();
        if (!mounted) return;

        const entries: CalendarProgram[] = [];

        // From purchases/assignments with active instance, or assignment-only entries
        for (const p of data.programs || []) {
          const sourceType = p.sourceType;
          const assignmentIdFromInstance =
            (p.instance as MyProgram["instance"] & { program_assignment_id?: string })?.program_assignment_id || null;
          const assignmentIdFromSource = sourceType === "assignment" ? p.purchase?.id || null : null;
          const assignmentId = assignmentIdFromInstance || assignmentIdFromSource;
          const presetSelection = p.presetSelection || "athlete";
          const selectedPresetId = p.selectedPresetId || null;
          const needsPresetSelection = p.needsPresetSelection || false;

          if (p.instance && (p.instance.status === "active" || p.instance.status === "paused")) {
            entries.push({
              id: p.instance.id,
              name: p.program?.name || p.instance.planName || "Programa",
              assignmentId,
              instanceId: p.instance.id,
              programId: p.program?.id || null,
              startDate: p.instance.startDate || null,
              presetSelection,
              selectedPresetId,
              needsPresetSelection,
            });
            continue;
          }

          // Assignment without active strength instance still needs calendar setup.
          if (!p.instance && sourceType === "assignment" && assignmentId) {
            entries.push({
              id: assignmentId,
              name: p.program?.name || "Programa",
              assignmentId,
              instanceId: null,
              programId: p.program?.id || null,
              startDate: p.purchase?.paidAt || null,
              presetSelection,
              selectedPresetId,
              needsPresetSelection,
            });
            continue;
          }

        }

        // Orphaned instances (no purchase)
        for (const inst of data.orphanedInstances || []) {
          if (inst.status === "active" || inst.status === "paused") {
            entries.push({
              id: inst.id,
              name: inst.plan?.name || "Plano de Força",
              assignmentId: inst.program_assignment_id || null,
              instanceId: inst.id,
              programId: inst.plan?.training_program_id || null,
              startDate: inst.start_date || null,
              presetSelection: "athlete",
              selectedPresetId: null,
              needsPresetSelection: false,
            });
          }
        }

        setPrograms(entries);

        // Auto-select first program
        if (entries.length > 0) {
          setSelectedProgram(entries[0]);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar programas.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, []);

  // ── Step 2: When selected program changes, load its plan ──
  useEffect(() => {
    if (!selectedProgram) return;
    let mounted = true;

    const loadPlan = async () => {
      setPlanLoading(true);
      setError(null);
      setPlan([]);
      setPresets([]);
      setSessions([]);

      try {
        const planData = await fetchAthleteWeeklyPlan(
          selectedProgram.assignmentId || undefined,
          undefined,
          selectedProgram.instanceId || undefined
        );
        if (!mounted) return;

        const rows = planData.plan || [];
        setPlan(rows);

        if (rows.length > 0) {
          // Determine initial week — current week based on start date
          const current = getCurrentWeek(selectedProgram.startDate);
          const weeks = [...new Set(rows.map((r) => r.week_number))].sort((a, b) => a - b);
          const closest = weeks.find((w) => w >= current) || weeks[weeks.length - 1] || 1;
          setSelectedWeek(closest);
        } else if (selectedProgram.programId) {
          // No plan: load presets for setup
          const [presetsData, sessionsData] = await Promise.all([
            fetchSchedulePresets(selectedProgram.programId),
            fetchWeeklySessions(selectedProgram.programId),
          ]);
          if (!mounted) return;
          setPresets(presetsData.presets || []);
          setSessions(sessionsData.sessions || []);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar calendário.");
      } finally {
        if (mounted) setPlanLoading(false);
      }
    };

    loadPlan();
    return () => { mounted = false; };
  }, [selectedProgram]);

  // ── Derived data ──
  const weekNumbers = useMemo(() => {
    return [...new Set(plan.map((r) => r.week_number))].sort((a, b) => a - b);
  }, [plan]);

  const weekRows = useMemo(() => {
    return plan.filter((r) => r.week_number === selectedWeek);
  }, [plan, selectedWeek]);

  const dayGrid = useMemo(() => {
    const grid: WeeklyPlanRow[][] = Array.from({ length: 7 }, () => []);
    weekRows.forEach((r) => {
      if (r.day_of_week >= 0 && r.day_of_week <= 6) {
        grid[r.day_of_week].push(r);
      }
    });
    grid.forEach((day) => day.sort((a, b) => a.time_slot - b.time_slot));
    return grid;
  }, [weekRows]);

  // Progress stats
  const totalRows = plan.length;
  const completedRows = plan.filter((r) => r.status === "completed").length;

  const handleGeneratePlan = useCallback(
    async (presetId: string) => {
      if (!selectedProgram?.assignmentId) {
        setError("Nenhum assignment encontrado para gerar calendário.");
        return;
      }
      setGenerating(true);
      setError(null);
      try {
        await generateWeeklyPlan(selectedProgram.assignmentId, presetId);
        const planData = await fetchAthleteWeeklyPlan(
          selectedProgram.assignmentId,
          undefined,
          selectedProgram.instanceId || undefined
        );
        const rows = planData.plan || [];
        setPlan(rows);
        setPresets([]);
        setSessions([]);
        if (rows.length > 0) setSelectedWeek(1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao gerar calendário.");
      } finally {
        setGenerating(false);
      }
    },
    [selectedProgram]
  );

  // ── Loading states ──
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
      </div>
    );
  }

  // ── No programs ──
  if (programs.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center px-5 pb-8 pt-6 text-[#e4e8ef]">
        <div className="w-full max-w-md text-center">
          <PageHeader />
          <div className="mt-8 rounded-xl border border-[#30363d] bg-[#161b22] p-6">
            <svg className="mx-auto h-10 w-10 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <p className="mt-3 text-sm text-[#8f99a8]">
              Nenhum programa ativo encontrado.
            </p>
            <p className="mt-1 text-xs text-[#484f58]">
              Quando tiveres um programa atribuído, o calendário aparecerá aqui.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-5 pb-8 pt-6 text-[#e4e8ef]">
      <div className="w-full max-w-md">
        <PageHeader />

        {/* ── Program selector (if multiple) ── */}
        {programs.length > 1 && (
          <div className="mt-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {programs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProgram(p)}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    selectedProgram?.id === p.id
                      ? "border-[#d4a54f] bg-[#d4a54f]/15 text-[#d4a54f]"
                      : "border-[#30363d] bg-[#161b22] text-[#8f99a8]"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Progress bar */}
        {hasPlan && totalRows > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] text-[#8f99a8]">
              <span>{selectedProgram?.name}</span>
              <span>{completedRows}/{totalRows} sessões</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-[#21262d]">
              <div
                className="h-full rounded-full bg-[#d4a54f] transition-all"
                style={{ width: `${Math.round((completedRows / totalRows) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-[#7c1f1f] bg-[#2a1111] px-4 py-3 text-sm text-[#ffd4d4]">
            {error}
          </div>
        )}

        {/* ── Plan loading ── */}
        {planLoading && (
          <div className="mt-8 flex items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
          </div>
        )}

        {/* ── Preset selection (no plan yet) ── */}
        {!planLoading && !hasPlan && selectedProgram?.presetSelection === "coach" && selectedProgram?.needsPresetSelection && (
          <div className="mt-6 text-center">
            <svg className="mx-auto h-10 w-10 text-[#484f58]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-3 text-sm text-[#8f99a8]">
              O teu coach ainda está a configurar o calendário.
            </p>
            <p className="mt-1 text-xs text-[#484f58]">
              Receberás uma notificação quando o calendário estiver pronto.
            </p>
          </div>
        )}

        {!planLoading && !hasPlan && presets.length > 0 && selectedProgram?.presetSelection !== "coach" && (
          <div className="mt-6">
            <h2 className="mb-3 text-lg font-semibold text-[#f7f1e8]">
              Escolhe o teu calendário
            </h2>
            <p className="mb-4 text-xs text-[#8f99a8]">
              Seleciona o layout semanal que melhor se adapta à tua disponibilidade.
            </p>
            <div className="space-y-3">
              {presets.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  sessions={sessions}
                  onSelect={() => handleGeneratePlan(preset.id)}
                  generating={generating}
                />
              ))}
            </div>
          </div>
        )}

        {!planLoading && !hasPlan && presets.length === 0 && !selectedProgram?.needsPresetSelection && (
          <div className="mt-8 text-center text-sm text-[#8f99a8]">
            Nenhum calendário disponível para este programa.
          </div>
        )}

        {/* ── Calendar view (plan exists) ── */}
        {!planLoading && hasPlan && (
          <div className="mt-5">
            {/* Week selector */}
            <div className="mb-4 flex items-center gap-2">
              <button
                onClick={() => setSelectedWeek((w) => Math.max(1, w - 1))}
                disabled={selectedWeek <= 1}
                className="rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-sm text-[#c9d1d9] disabled:opacity-40"
              >
                ←
              </button>
              <span className="flex-1 text-center text-sm font-semibold text-[#c9d1d9]">
                Semana {selectedWeek}
                {weekRows.length > 0 && (
                  <span className="ml-2 text-xs text-[#8f99a8]">
                    ({weekRows[0].week_start_date})
                  </span>
                )}
              </span>
              <button
                onClick={() => setSelectedWeek((w) => Math.min(weekNumbers[weekNumbers.length - 1] || 1, w + 1))}
                disabled={selectedWeek >= (weekNumbers[weekNumbers.length - 1] || 1)}
                className="rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-sm text-[#c9d1d9] disabled:opacity-40"
              >
                →
              </button>
            </div>

            {/* 7-day grid */}
            <div className="grid grid-cols-7 gap-1">
              {dayGrid.map((daySessions, dayIndex) => (
                <div key={dayIndex} className="min-w-0">
                  <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-[#8f99a8]">
                    {DAY_LABELS[dayIndex]}
                  </div>
                  {daySessions.length > 0 ? (
                    daySessions.map((row) => (
                      <SessionCell
                        key={row.id}
                        row={row}
                        onTap={() => handleSessionTap(row, navigate)}
                      />
                    ))
                  ) : (
                    <div className="rounded-lg bg-[#0d1117] p-2 text-center text-[10px] text-[#30363d]">
                      —
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Week stats */}
            <div className="mt-3 flex justify-center gap-4 text-[10px] text-[#8f99a8]">
              <span>{weekRows.filter((r) => r.session_type === "strength").length} força</span>
              <span>{weekRows.filter((r) => r.session_type === "running").length} corrida</span>
              <span>{weekRows.filter((r) => r.status === "completed").length} feitos</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function PageHeader() {
  return (
    <div className="text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#d4a54f]">
        Área do Atleta
      </p>
      <h1 className="mt-1 font-['Oswald'] text-3xl font-bold uppercase tracking-wide text-[#f7f1e8]">
        Calendário
      </h1>
    </div>
  );
}

function PresetCard({
  preset,
  sessions,
  onSelect,
  generating,
}: {
  preset: SchedulePreset;
  sessions: WeeklySession[];
  onSelect: () => void;
  generating: boolean;
}) {
  const sessionMap = useMemo(
    () => new Map(sessions.map((s) => [s.id, s])),
    [sessions]
  );

  const grid = useMemo(() => {
    const g: (WeeklySession | null)[][] = Array.from({ length: 7 }, () => []);
    (preset.slots || []).forEach((slot) => {
      const sess = sessionMap.get(slot.session_id);
      if (slot.day_of_week >= 0 && slot.day_of_week <= 6) {
        g[slot.day_of_week].push(sess || null);
      }
    });
    return g;
  }, [preset.slots, sessionMap]);

  return (
    <button
      onClick={onSelect}
      disabled={generating}
      className="w-full rounded-xl border border-[#30363d] bg-[#161b22] p-4 text-left transition hover:border-[#d4a54f]/50 disabled:opacity-50"
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-[#c9d1d9]">{preset.preset_name}</span>
          {preset.is_default && (
            <span className="ml-2 rounded bg-[#1a7f37] px-2 py-0.5 text-[10px] text-white">
              recomendado
            </span>
          )}
        </div>
        <span className="text-xs text-[#8f99a8]">{preset.total_training_days} dias</span>
      </div>
      {preset.description && (
        <p className="mt-1 text-xs text-[#8f99a8]">{preset.description}</p>
      )}
      {/* Mini preview grid */}
      <div className="mt-3 grid grid-cols-7 gap-1">
        {grid.map((daySessions, i) => (
          <div key={i} className="text-center">
            <div className="text-[8px] text-[#484f58]">{DAY_LABELS[i]}</div>
            {daySessions.length > 0 ? (
              daySessions.map((sess, j) => {
                const color = sess ? SESSION_COLORS[sess.session_type] || SESSION_COLORS.other : "bg-zinc-800";
                return (
                  <div
                    key={j}
                    className={`mt-0.5 rounded border px-0.5 py-0.5 text-[7px] leading-tight ${color}`}
                    title={sess?.session_label}
                  >
                    {sess ? sess.session_label.slice(0, 6) : "?"}
                  </div>
                );
              })
            ) : (
              <div className="mt-0.5 text-[8px] text-[#30363d]">—</div>
            )}
          </div>
        ))}
      </div>
    </button>
  );
}

function SessionCell({ row, onTap }: { row: WeeklyPlanRow; onTap: () => void }) {
  const colorClass = SESSION_COLORS[row.session_type] || SESSION_COLORS.other;
  const isClickable = row.session_type === "strength" && !!row.strength_instance_id;
  const statusIcon =
    row.status === "completed"
      ? "✓"
      : row.status === "skipped"
      ? "✗"
      : "";

  return (
    <button
      onClick={isClickable ? onTap : undefined}
      className={`mb-1 w-full rounded-lg border p-1.5 text-left ${colorClass} ${
        isClickable ? "cursor-pointer active:opacity-80" : "cursor-default"
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="text-[9px] font-medium leading-tight text-[#c9d1d9]">
          {row.session_label.length > 12
            ? row.session_label.slice(0, 12) + "…"
            : row.session_label}
        </span>
        {statusIcon && (
          <span
            className={`text-[10px] ${
              row.status === "completed" ? "text-green-400" : "text-red-400"
            }`}
          >
            {statusIcon}
          </span>
        )}
      </div>
      {row.duration_estimate_min && (
        <div className="text-[8px] text-[#8f99a8]">{row.duration_estimate_min}min</div>
      )}
    </button>
  );
}

function handleSessionTap(row: WeeklyPlanRow, navigate: ReturnType<typeof useNavigate>) {
  if (row.session_type === "strength" && row.strength_instance_id) {
    navigate(
      `/atleta/forca?instanceId=${row.strength_instance_id}&day=${row.strength_day_number || 1}&week=${row.week_number}`
    );
  }
}
