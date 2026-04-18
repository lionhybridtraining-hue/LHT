import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import type { AthleteOutletContext } from "@/components/atleta/AthleteLayout";
import { getAccessToken } from "@/lib/supabase";
import { fetchOnboardingIntake, mergeOnboardingAnswers } from "@/lib/onboarding-intake";
import {
  fetchSchedulePresets,
  fetchWeeklySessions,
  fetchAthleteWeeklyPlan,
  generateWeeklyPlan,
  rescheduleWeeklyPlanRow,
  type SchedulePreset,
  type WeeklySession,
  type WeeklyPlanRow,
} from "@/services/athlete-schedule";
import {
  fetchMyPrograms,
  type MyProgram,
} from "@/services/athlete-my-programs";
import {
  fetchVariantsForProgram,
  type ProgramVariant,
} from "@/services/variant-service";
import { fetchAthleteProfile, type AthleteProfileData } from "@/services/athlete-profile";
import { VariantPicker } from "@/components/atleta/VariantPicker";

const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const SESSION_THEME: Record<string, { badge: string; chip: string }> = {
  strength: { badge: "bg-blue-900/60 border-blue-700", chip: "bg-blue-600/20 text-blue-200" },
  running: { badge: "bg-emerald-900/60 border-emerald-700", chip: "bg-emerald-600/20 text-emerald-200" },
  cycling: { badge: "bg-amber-900/60 border-amber-700", chip: "bg-amber-600/20 text-amber-200" },
  rest: { badge: "bg-zinc-800/60 border-zinc-600", chip: "bg-zinc-600/20 text-zinc-200" },
  mobility: { badge: "bg-cyan-900/60 border-cyan-700", chip: "bg-cyan-600/20 text-cyan-200" },
  recovery: { badge: "bg-cyan-900/60 border-cyan-700", chip: "bg-cyan-600/20 text-cyan-200" },
  other: { badge: "bg-zinc-700/60 border-zinc-600", chip: "bg-zinc-600/20 text-zinc-200" },
};

type CalendarViewMode = "multi-week" | "week" | "day";

type CalendarPriority = "balanced" | "strength" | "running";

interface CalendarPreferences {
  preferredTrainingDays: number[];
  availableGymDays: number[];
  allowsDoubleSessions: boolean | null;
  priority: CalendarPriority;
}

interface PresetRecommendationResult {
  recommendedPresetId: string | null;
  rankedPresetIds: string[];
  reasons: string[];
  needsMoreContext: boolean;
}

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
  defaultVariantId: string | null;
  presetSelection: "coach" | "athlete";
  selectedPresetId: string | null;
  selectedVariantId: string | null;
  needsPresetSelection: boolean;
}

interface WeekSummary {
  plannedMinutes: number;
  doneMinutes: number;
  plannedStrength: number;
  doneStrength: number;
}

interface WeekBundle {
  weekNumber: number;
  weekStartDate: string;
  rows: WeeklyPlanRow[];
  days: WeeklyPlanRow[][];
  summary: WeekSummary;
}

interface PendingPreviewRow {
  id: string;
  dateIso: string;
  timeSlot: number;
  label: string;
}

function startOfDayFromIso(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00`);
}

function formatDatePt(dateIso: string): string {
  return startOfDayFromIso(dateIso).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
  });
}

function getDateForDay(weekStartDate: string, dayOfWeek: number): string {
  const date = startOfDayFromIso(weekStartDate);
  date.setDate(date.getDate() + dayOfWeek);
  return date.toISOString().slice(0, 10);
}

function getWeekStartDateIso(dateIso: string): string {
  const date = startOfDayFromIso(dateIso);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

function getCurrentOrNextMondayIso(dateIso: string): string {
  const date = startOfDayFromIso(dateIso);
  const day = (date.getDay() + 6) % 7;
  if (day === 0) return date.toISOString().slice(0, 10);
  date.setDate(date.getDate() + (7 - day));
  return date.toISOString().slice(0, 10);
}

function formatDatePtLong(dateIso: string): string {
  return startOfDayFromIso(dateIso).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function summarizeWeek(rows: WeeklyPlanRow[]): WeekSummary {
  return rows.reduce(
    (acc, row) => {
      const duration = row.duration_estimate_min || 0;
      acc.plannedMinutes += duration;
      if (row.status === "completed") {
        acc.doneMinutes += duration;
      }
      if (row.session_type === "strength") {
        acc.plannedStrength += 1;
        if (row.status === "completed") acc.doneStrength += 1;
      }
      return acc;
    },
    {
      plannedMinutes: 0,
      doneMinutes: 0,
      plannedStrength: 0,
      doneStrength: 0,
    }
  );
}

function buildWeekBundle(weekNumber: number, rows: WeeklyPlanRow[]): WeekBundle {
  const sorted = [...rows].sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return a.time_slot - b.time_slot;
  });

  const days: WeeklyPlanRow[][] = Array.from({ length: 7 }, () => []);
  sorted.forEach((row) => {
    if (row.day_of_week >= 0 && row.day_of_week <= 6) {
      days[row.day_of_week].push(row);
    }
  });

  return {
    weekNumber,
    weekStartDate: sorted[0]?.week_start_date || new Date().toISOString().slice(0, 10),
    rows: sorted,
    days,
    summary: summarizeWeek(sorted),
  };
}

function pickDaySport(rows: WeeklyPlanRow[]): string {
  if (!rows.length) return "rest";
  if (rows.some((r) => r.session_type === "strength")) return "strength";
  if (rows.some((r) => r.session_type === "running")) return "running";
  if (rows.some((r) => r.session_type === "mobility")) return "mobility";
  return rows[0].session_type || "other";
}

function normalizeExperienceLevel(value: string | null | undefined): "beginner" | "intermediate" | "advanced" | null {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (!normalized) return null;
  if (["iniciante", "beginner", "starter"].includes(normalized)) return "beginner";
  if (["intermedio", "intermédio", "intermediate", "building"].includes(normalized)) return "intermediate";
  if (["avancado", "avançado", "advanced", "performance"].includes(normalized)) return "advanced";
  return null;
}

function normalizeCalendarPreferences(answers: Record<string, unknown> | null | undefined): CalendarPreferences {
  const prefs = answers && typeof answers.calendar_preferences === "object" && answers.calendar_preferences
    ? (answers.calendar_preferences as Record<string, unknown>)
    : {};

  const toDayArray = (value: unknown) => {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => Number(entry))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      .sort((left, right) => left - right);
  };

  const allowsDoubleSessions = typeof prefs.allowsDoubleSessions === "boolean"
    ? prefs.allowsDoubleSessions
    : null;
  const priority = prefs.priority === "strength" || prefs.priority === "running"
    ? prefs.priority
    : "balanced";

  return {
    preferredTrainingDays: toDayArray(prefs.preferredTrainingDays),
    availableGymDays: toDayArray(prefs.availableGymDays),
    allowsDoubleSessions,
    priority,
  };
}

function serializeCalendarPreferences(preferences: CalendarPreferences) {
  return {
    calendar_preferences: {
      preferredTrainingDays: preferences.preferredTrainingDays,
      availableGymDays: preferences.availableGymDays,
      allowsDoubleSessions: preferences.allowsDoubleSessions,
      priority: preferences.priority,
    }
  };
}

function summarizePresetLayout(preset: SchedulePreset, sessions: WeeklySession[]) {
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));
  const occupiedDays = new Set<number>();
  const strengthDays = new Set<number>();
  const runningDays = new Set<number>();
  const slotsPerDay = new Map<number, number>();

  (preset.slots || []).forEach((slot) => {
    const day = Number(slot.day_of_week);
    if (!Number.isInteger(day) || day < 0 || day > 6) return;
    occupiedDays.add(day);
    slotsPerDay.set(day, (slotsPerDay.get(day) || 0) + 1);
    const session = sessionMap.get(slot.session_id);
    if (!session) return;
    if (session.session_type === "strength") strengthDays.add(day);
    if (session.session_type === "running") runningDays.add(day);
  });

  const doubleSessionDays = [...slotsPerDay.entries()]
    .filter(([, count]) => count > 1)
    .map(([day]) => day)
    .sort((left, right) => left - right);

  return {
    occupiedDays: [...occupiedDays].sort((left, right) => left - right),
    strengthDays: [...strengthDays].sort((left, right) => left - right),
    runningDays: [...runningDays].sort((left, right) => left - right),
    doubleSessionDays,
  };
}

function getCompatiblePresetsForVariant(variant: ProgramVariant | null, presets: SchedulePreset[]) {
  if (!variant) return [];
  const compatible = Array.isArray(variant.compatible_presets) ? variant.compatible_presets : [];
  if (!compatible.length) return presets;

  return compatible
    .slice()
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
    .map((entry) => presets.find((preset) => preset.id === entry.preset_id) || entry.preset || null)
    .filter((preset): preset is SchedulePreset => Boolean(preset));
}

function recommendVariant(
  variants: ProgramVariant[],
  programDefaultVariantId: string | null | undefined,
  profile: AthleteProfileData | null
) {
  if (!variants.length) return null;
  const targetFrequency = Number(profile?.onboarding.weeklyFrequency || 0) || null;
  const targetExperience = normalizeExperienceLevel(profile?.onboarding.experienceLevel) || profile?.athlete.strengthLevel || null;

  const ranked = variants
    .map((variant) => {
      let score = 0;
      if (programDefaultVariantId && variant.id === programDefaultVariantId) score += 12;
      if (targetFrequency != null) score += Math.max(0, 18 - Math.abs(variant.weekly_frequency - targetFrequency) * 6);
      if (targetExperience && variant.experience_level === targetExperience) score += 14;
      return { variant, score };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.variant?.id || null;
}

function recommendPreset(
  presets: SchedulePreset[],
  sessions: WeeklySession[],
  preferences: CalendarPreferences,
  profile: AthleteProfileData | null,
  variant: ProgramVariant | null
): PresetRecommendationResult {
  if (!presets.length) {
    return {
      recommendedPresetId: null,
      rankedPresetIds: [],
      reasons: [],
      needsMoreContext: false,
    };
  }

  const preferredWeeklyFrequency = Number(profile?.onboarding.weeklyFrequency || 0) || null;
  const ranked = presets.map((preset) => {
    const layout = summarizePresetLayout(preset, sessions);
    const reasons: string[] = [];
    let score = 0;

    if (variant) {
      const matchingLink = (variant.compatible_presets || []).find((entry) => entry.preset_id === preset.id);
      if (matchingLink?.is_default) {
        score += 12;
        reasons.push("é o calendário recomendado nesta opção");
      }
      score += Math.max(0, 20 - Math.abs(preset.total_training_days - variant.weekly_frequency) * 6);
    }

    if (preferredWeeklyFrequency != null) {
      score += Math.max(0, 14 - Math.abs(preset.total_training_days - preferredWeeklyFrequency) * 5);
    }

    if (preferences.preferredTrainingDays.length > 0) {
      const matches = layout.occupiedDays.filter((day) => preferences.preferredTrainingDays.includes(day)).length;
      score += matches * 6;
      if (matches > 0) reasons.push("encaixa melhor nos dias que indicaste para treinar");
    }

    if (preferences.availableGymDays.length > 0 && layout.strengthDays.length > 0) {
      const gymMatches = layout.strengthDays.filter((day) => preferences.availableGymDays.includes(day)).length;
      const gymMisses = layout.strengthDays.length - gymMatches;
      score += gymMatches * 8;
      score -= gymMisses * 10;
      if (gymMatches > 0) reasons.push("coloca a força em dias compatíveis com o teu acesso ao ginásio");
    }

    if (preferences.allowsDoubleSessions === false) {
      if (layout.doubleSessionDays.length === 0) {
        score += 10;
        reasons.push("evita dias com duas sessões");
      } else {
        score -= layout.doubleSessionDays.length * 12;
      }
    } else if (preferences.allowsDoubleSessions === true && layout.doubleSessionDays.length > 0) {
      score += 4;
    }

    if (preferences.priority === "strength" && layout.strengthDays.length > 0) {
      score += layout.strengthDays.length * 2;
    }
    if (preferences.priority === "running" && layout.runningDays.length > 0) {
      score += layout.runningDays.length * 2;
    }

    return {
      preset,
      score,
      reasons,
    };
  }).sort((left, right) => right.score - left.score);

  const top = ranked[0] || null;
  const runnerUp = ranked[1] || null;
  const missingSignal = preferences.preferredTrainingDays.length === 0 || preferences.availableGymDays.length === 0 || preferences.allowsDoubleSessions == null;
  const needsMoreContext = Boolean(top && runnerUp && Math.abs(top.score - runnerUp.score) <= 6 && missingSignal);

  return {
    recommendedPresetId: top ? top.preset.id : null,
    rankedPresetIds: ranked.map((entry) => entry.preset.id),
    reasons: top ? top.reasons.slice(0, 3) : [],
    needsMoreContext,
  };
}

export default function CalendarioPage() {
  useOutletContext<AthleteOutletContext>();
  return <CalendarioContent />;
}

function CalendarioContent() {
  const navigate = useNavigate();

  // ── State ──
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [programs, setPrograms] = useState<CalendarProgram[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<CalendarProgram | null>(null);
  const [plan, setPlan] = useState<WeeklyPlanRow[]>([]);
  const [presets, setPresets] = useState<SchedulePreset[]>([]);
  const [sessions, setSessions] = useState<WeeklySession[]>([]);
  const [variants, setVariants] = useState<ProgramVariant[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDay, setSelectedDay] = useState(0);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [generating, setGenerating] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null);
  const [pendingVariantId, setPendingVariantId] = useState<string | null>(null);
  const [pendingStartDate, setPendingStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfileData | null>(null);
  const [calendarPreferences, setCalendarPreferences] = useState<CalendarPreferences>({
    preferredTrainingDays: [],
    availableGymDays: [],
    allowsDoubleSessions: null,
    priority: "balanced",
  });
  const [selectedSetupVariantId, setSelectedSetupVariantId] = useState<string | null>(null);
  const [showCalendarPreferenceForm, setShowCalendarPreferenceForm] = useState(false);
  const [runVolumeConfig, setRunVolumeConfig] = useState({
    initialWeeklyVolumeKm: "30",
    weeklyProgressionPct: "5",
    periodizationType: "undulating" as "linear" | "undulating" | "block",
  });
  const [runVolumeConfigError, setRunVolumeConfigError] = useState<string | null>(null);
  const [movingRow, setMovingRow] = useState<WeeklyPlanRow | null>(null);
  const [moveTargetDay, setMoveTargetDay] = useState(0);
  const [movingBusy, setMovingBusy] = useState(false);

  const hasPlan = plan.length > 0;
  const hasRunningSessions = useMemo(
    () => sessions.some((s) => s.session_type === "running"),
    [sessions]
  );
  const pendingPreset = useMemo(
    () => presets.find((preset) => preset.id === pendingPresetId) || null,
    [pendingPresetId, presets]
  );
  const pendingVariant = useMemo(
    () => variants.find((variant) => variant.id === pendingVariantId) || null,
    [pendingVariantId, variants]
  );
  const needsRunningConfig = Boolean(
    hasRunningSessions && !pendingVariant?.running_config_preset?.initial_weekly_volume_km
  );
  const pendingPreviewRows = useMemo<PendingPreviewRow[]>(() => {
    if (!pendingPreset || !pendingStartDate) return [];

    const weekStartDate = getWeekStartDateIso(pendingStartDate);
    const sessionMap = new Map(sessions.map((session) => [session.id, session]));

    return (pendingPreset.slots || [])
      .filter((slot) => Number(slot.week_number || 1) === 1)
      .map((slot) => ({
        id: slot.id,
        dateIso: getDateForDay(weekStartDate, slot.day_of_week),
        timeSlot: slot.time_slot,
        label: sessionMap.get(slot.session_id)?.session_label || "Sessão",
      }))
      .filter((row) => row.dateIso >= pendingStartDate)
      .sort((left, right) => {
        if (left.dateIso !== right.dateIso) return left.dateIso.localeCompare(right.dateIso);
        return left.timeSlot - right.timeSlot;
      });
  }, [pendingPreset, pendingStartDate, sessions]);

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
          const selectedVariantId = p.selectedVariantId || null;
          const needsPresetSelection = p.needsPresetSelection || false;

          if (p.instance && (p.instance.status === "active" || p.instance.status === "paused")) {
            entries.push({
              id: p.instance.id,
              name: p.program?.name || p.instance.planName || "Programa",
              assignmentId,
              instanceId: p.instance.id,
              programId: p.program?.id || null,
              startDate: p.instance.startDate || null,
              defaultVariantId: p.program?.defaultVariantId || null,
              presetSelection,
              selectedPresetId,
              selectedVariantId,
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
              defaultVariantId: p.program?.defaultVariantId || null,
              presetSelection,
              selectedPresetId,
              selectedVariantId,
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
              defaultVariantId: null,
              presetSelection: "athlete",
              selectedPresetId: null,
              selectedVariantId: null,
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
      setVariants([]);
      setSelectedSetupVariantId(null);
      setShowCalendarPreferenceForm(false);
      setMovingRow(null);

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
          setSelectedDay(0);
          setViewMode("week");
        } else if (selectedProgram.programId) {
          // No plan: load presets, sessions, and variants for setup
          const [presetsData, sessionsData, variantsData, profileData, intakeData] = await Promise.all([
            fetchSchedulePresets(selectedProgram.programId),
            fetchWeeklySessions(selectedProgram.programId),
            fetchVariantsForProgram(selectedProgram.programId).catch(() => ({ variants: [] })),
            fetchAthleteProfile().catch(() => null),
            (async () => {
              const token = await getAccessToken();
              return fetchOnboardingIntake(token).catch(() => null);
            })(),
          ]);
          if (!mounted) return;
          setPresets(presetsData.presets || []);
          setSessions(sessionsData.sessions || []);
          setVariants(variantsData.variants || []);
          setAthleteProfile(profileData || null);
          const answers = intakeData && intakeData.answers && typeof intakeData.answers === "object"
            ? (intakeData.answers as Record<string, unknown>)
            : {};
          setCalendarPreferences(normalizeCalendarPreferences(answers));
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

  const weekBundles = useMemo(() => {
    const byWeek = new Map<number, WeeklyPlanRow[]>();
    plan.forEach((row) => {
      const list = byWeek.get(row.week_number) || [];
      list.push(row);
      byWeek.set(row.week_number, list);
    });

    return [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([weekNumber, rows]) => buildWeekBundle(weekNumber, rows));
  }, [plan, selectedWeek]);

  const selectedBundle = useMemo(() => {
    return weekBundles.find((b) => b.weekNumber === selectedWeek) || null;
  }, [weekBundles, selectedWeek]);

  const selectedDayRows = selectedBundle?.days[selectedDay] || [];

  const occupiedMoveDays = useMemo(() => {
    if (!movingRow || !selectedBundle) return new Set<number>();
    const occupied = new Set<number>();
    selectedBundle.rows.forEach((row) => {
      if (row.id === movingRow.id) return;
      if (row.time_slot !== movingRow.time_slot) return;
      occupied.add(row.day_of_week);
    });
    return occupied;
  }, [movingRow, selectedBundle]);

  // Program progress stats
  const totalRows = plan.length;
  const completedRows = plan.filter((r) => r.status === "completed").length;

  const recommendedVariantId = useMemo(() => {
    return recommendVariant(
      variants,
      selectedProgram?.defaultVariantId || null,
      athleteProfile
    );
  }, [variants, athleteProfile, selectedProgram]);

  const selectedSetupVariant = useMemo(
    () => variants.find((variant) => variant.id === selectedSetupVariantId) || null,
    [variants, selectedSetupVariantId]
  );

  const compatiblePresets = useMemo(() => {
    if (selectedSetupVariant) {
      return getCompatiblePresetsForVariant(selectedSetupVariant, presets);
    }
    return presets;
  }, [selectedSetupVariant, presets]);

  const presetRecommendation = useMemo(() => {
    return recommendPreset(
      compatiblePresets,
      sessions,
      calendarPreferences,
      athleteProfile,
      selectedSetupVariant
    );
  }, [compatiblePresets, sessions, calendarPreferences, athleteProfile, selectedSetupVariant]);

  const recommendedPreset = useMemo(
    () => compatiblePresets.find((preset) => preset.id === presetRecommendation.recommendedPresetId) || null,
    [compatiblePresets, presetRecommendation]
  );

  const alternativePresets = useMemo(
    () => compatiblePresets.filter((preset) => preset.id !== presetRecommendation.recommendedPresetId),
    [compatiblePresets, presetRecommendation]
  );

  useEffect(() => {
    if (!variants.length) {
      setSelectedSetupVariantId(null);
      return;
    }

    const preferredVariantId = selectedProgram?.selectedVariantId || recommendedVariantId || variants[0]?.id || null;
    setSelectedSetupVariantId((current) => {
      if (current && variants.some((variant) => variant.id === current)) return current;
      return preferredVariantId;
    });
  }, [variants, selectedProgram?.selectedVariantId, recommendedVariantId, selectedProgram]);

  useEffect(() => {
    if (!selectedSetupVariant || !compatiblePresets.length) {
      setShowCalendarPreferenceForm(false);
      return;
    }
    setShowCalendarPreferenceForm(presetRecommendation.needsMoreContext);
  }, [selectedSetupVariant, compatiblePresets, presetRecommendation]);

  const handleGeneratePlan = useCallback(
    async (
      presetId: string,
      runningConfig?: {
        initialWeeklyVolumeKm: number;
        weeklyProgressionPct: number;
        periodizationType: "linear" | "undulating" | "block";
      },
      variantId?: string,
      startDate?: string
    ) => {
      if (!selectedProgram?.assignmentId) {
        setError("Nenhum assignment encontrado para gerar calendário.");
        return;
      }
      setGenerating(true);
      setError(null);
      try {
        await generateWeeklyPlan(selectedProgram.assignmentId, presetId, {
          ...(runningConfig || {}),
          variantId,
          startDate,
        });
        const planData = await fetchAthleteWeeklyPlan(
          selectedProgram.assignmentId,
          undefined,
          selectedProgram.instanceId || undefined
        );
        const rows = planData.plan || [];
        setPlan(rows);
        setPresets([]);
        setSessions([]);
        setVariants([]);
        if (rows.length > 0) {
          const firstWeek = [...new Set(rows.map((r) => r.week_number))].sort((a, b) => a - b)[0] || 1;
          setSelectedWeek(firstWeek);
          setSelectedDay(0);
          setViewMode("week");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao gerar calendário.");
      } finally {
        setGenerating(false);
      }
    },
    [selectedProgram]
  );

  const resolveDefaultGenerationStartDate = useCallback(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const baseDate = selectedProgram?.startDate && selectedProgram.startDate > todayIso
      ? selectedProgram.startDate
      : todayIso;
    return getCurrentOrNextMondayIso(baseDate);
  }, [selectedProgram]);

  const openGenerationModal = useCallback((presetId: string, variantId?: string | null) => {
    setPendingPresetId(presetId);
    setPendingVariantId(variantId || null);
    setPendingStartDate(resolveDefaultGenerationStartDate());
    setRunVolumeConfigError(null);
  }, [resolveDefaultGenerationStartDate]);

  const handleOpenPresetGeneration = useCallback(
    (presetId: string) => {
      openGenerationModal(presetId, null);
    },
    [openGenerationModal]
  );

  const handleVariantSelect = useCallback(
    (variant: ProgramVariant) => {
      setSelectedSetupVariantId(variant.id);
      const variantPresets = getCompatiblePresetsForVariant(variant, presets);
      const recommendation = recommendPreset(
        variantPresets,
        sessions,
        calendarPreferences,
        athleteProfile,
        variant
      );
      const defaultPreset = variantPresets.find((preset) => preset.id === recommendation.recommendedPresetId)
        || variantPresets[0]
        || null;
      if (!defaultPreset) {
        setError("Nenhum calendário compatível disponível. O coach precisa configurar os horários desta opção.");
        return;
      }

      if (recommendation.needsMoreContext) {
        setShowCalendarPreferenceForm(true);
        return;
      }

      openGenerationModal(defaultPreset.id, variant.id);
    },
    [presets, sessions, calendarPreferences, athleteProfile, openGenerationModal]
  );

  const handleSaveCalendarPreferences = useCallback(async () => {
    try {
      const payload = serializeCalendarPreferences(calendarPreferences);
      const token = await getAccessToken();
      await mergeOnboardingAnswers(token, payload);
      setShowCalendarPreferenceForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao guardar preferências do calendário.");
    }
  }, [calendarPreferences]);

  const handleApplyRecommendedPreset = useCallback(() => {
    if (!recommendedPreset) {
      setError("Não foi possível determinar um calendário recomendado.");
      return;
    }

    if (!selectedSetupVariant) {
      void handleOpenPresetGeneration(recommendedPreset.id);
      return;
    }

    openGenerationModal(recommendedPreset.id, selectedSetupVariant.id);
  }, [recommendedPreset, selectedSetupVariant, handleOpenPresetGeneration, openGenerationModal]);

  const handleConfirmRunningConfig = useCallback(async () => {
    if (!pendingPresetId) return;

    const initialWeeklyVolumeKm = Number(runVolumeConfig.initialWeeklyVolumeKm);
    const weeklyProgressionPct = Number(runVolumeConfig.weeklyProgressionPct);
    const periodizationType = runVolumeConfig.periodizationType;

    if (!Number.isFinite(initialWeeklyVolumeKm) || initialWeeklyVolumeKm < 5 || initialWeeklyVolumeKm > 300) {
      setRunVolumeConfigError("Volume inicial inválido (5-300 km).");
      return;
    }
    if (!Number.isFinite(weeklyProgressionPct) || weeklyProgressionPct < -5 || weeklyProgressionPct > 20) {
      setRunVolumeConfigError("Progressão semanal inválida (-5 a 20%).");
      return;
    }
    if (!["linear", "undulating", "block"].includes(periodizationType)) {
      setRunVolumeConfigError("Periodização inválida.");
      return;
    }

    const presetId = pendingPresetId;
    const variantId = pendingVariantId;
    const startDate = pendingStartDate;
    setPendingPresetId(null);
    setPendingVariantId(null);
    setRunVolumeConfigError(null);
    await handleGeneratePlan(presetId, {
      initialWeeklyVolumeKm,
      weeklyProgressionPct,
      periodizationType,
    }, variantId || undefined, startDate);
  }, [handleGeneratePlan, pendingPresetId, pendingStartDate, pendingVariantId, runVolumeConfig]);

  const handleConfirmGeneration = useCallback(async () => {
    if (!pendingPresetId) return;
    if (needsRunningConfig) {
      await handleConfirmRunningConfig();
      return;
    }

    const presetId = pendingPresetId;
    const variantId = pendingVariantId;
    const startDate = pendingStartDate;
    setPendingPresetId(null);
    setPendingVariantId(null);
    setRunVolumeConfigError(null);
    await handleGeneratePlan(presetId, undefined, variantId || undefined, startDate);
  }, [handleConfirmRunningConfig, handleGeneratePlan, needsRunningConfig, pendingPresetId, pendingStartDate, pendingVariantId]);

  const handleOpenMoveModal = useCallback((row: WeeklyPlanRow) => {
    setMoveTargetDay(row.day_of_week);
    setMovingRow(row);
  }, []);

  const handleConfirmMove = useCallback(async () => {
    if (!movingRow || !selectedProgram) return;
    if (moveTargetDay === movingRow.day_of_week) {
      setMovingRow(null);
      return;
    }

    setMovingBusy(true);
    setError(null);
    try {
      await rescheduleWeeklyPlanRow(movingRow.id, moveTargetDay);
      const planData = await fetchAthleteWeeklyPlan(
        selectedProgram.assignmentId || undefined,
        undefined,
        selectedProgram.instanceId || undefined
      );
      const rows = planData.plan || [];
      setPlan(rows);
      setSelectedDay(moveTargetDay);
      setMovingRow(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao mover sessão.");
    } finally {
      setMovingBusy(false);
    }
  }, [moveTargetDay, movingRow, selectedProgram]);

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

        {!planLoading && !hasPlan && variants.length > 0 && selectedProgram?.presetSelection !== "coach" && (
          <div className="mt-6">
            <VariantPicker
              variants={variants}
              onSelect={handleVariantSelect}
              generating={generating}
              recommendedVariantId={recommendedVariantId}
            />

            {selectedSetupVariant && (
              <div className="mt-4 rounded-xl border border-[#30363d] bg-[#161b22] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d4a54f]">
                      recomendação de calendário
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-[#f7f1e8]">
                      {recommendedPreset?.preset_name || "Sem calendário recomendado"}
                    </h3>
                  </div>
                  {recommendedPreset && (
                    <button
                      onClick={handleApplyRecommendedPreset}
                      disabled={generating}
                      className="rounded-lg border border-[#d4a54f] bg-[#d4a54f]/15 px-3 py-2 text-xs font-semibold text-[#d4a54f] disabled:opacity-50"
                    >
                      {generating ? "A gerar..." : "Usar recomendado"}
                    </button>
                  )}
                </div>

                {presetRecommendation.reasons.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {presetRecommendation.reasons.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-full border border-[#30363d] bg-[#0d1117] px-2 py-1 text-[11px] text-[#8f99a8]"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                )}

                {recommendedPreset?.description && (
                  <p className="mt-3 text-xs text-[#8f99a8]">{recommendedPreset.description}</p>
                )}

                {showCalendarPreferenceForm && (
                  <div className="mt-4 rounded-xl border border-[#30363d] bg-[#0d1117] p-4">
                    <h4 className="text-sm font-semibold text-[#f7f1e8]">Faltam-nos alguns detalhes para acertar melhor</h4>
                    <p className="mt-1 text-xs text-[#8f99a8]">
                      Responde só ao que influencia a distribuição da tua semana. Guardamos isto para recomendações futuras.
                    </p>

                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="text-xs font-medium text-[#c9d1d9]">Em que dias preferes treinar?</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {DAY_LABELS.map((label, day) => {
                            const active = calendarPreferences.preferredTrainingDays.includes(day);
                            return (
                              <button
                                key={`pref-${day}`}
                                type="button"
                                onClick={() => setCalendarPreferences((current) => ({
                                  ...current,
                                  preferredTrainingDays: active
                                    ? current.preferredTrainingDays.filter((entry) => entry !== day)
                                    : [...current.preferredTrainingDays, day].sort((left, right) => left - right),
                                }))}
                                className={`rounded-md border px-2.5 py-1.5 text-xs ${active ? "border-[#d4a54f] bg-[#d4a54f]/15 text-[#d4a54f]" : "border-[#30363d] bg-[#161b22] text-[#8f99a8]"}`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-medium text-[#c9d1d9]">Em que dias tens acesso ao ginásio?</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {DAY_LABELS.map((label, day) => {
                            const active = calendarPreferences.availableGymDays.includes(day);
                            return (
                              <button
                                key={`gym-${day}`}
                                type="button"
                                onClick={() => setCalendarPreferences((current) => ({
                                  ...current,
                                  availableGymDays: active
                                    ? current.availableGymDays.filter((entry) => entry !== day)
                                    : [...current.availableGymDays, day].sort((left, right) => left - right),
                                }))}
                                className={`rounded-md border px-2.5 py-1.5 text-xs ${active ? "border-[#d4a54f] bg-[#d4a54f]/15 text-[#d4a54f]" : "border-[#30363d] bg-[#161b22] text-[#8f99a8]"}`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-medium text-[#c9d1d9]">Aceitas dias com duas sessões?</p>
                        <div className="mt-2 flex gap-2">
                          {[
                            { label: "Sim", value: true },
                            { label: "Não", value: false },
                          ].map((option) => (
                            <button
                              key={option.label}
                              type="button"
                              onClick={() => setCalendarPreferences((current) => ({ ...current, allowsDoubleSessions: option.value }))}
                              className={`rounded-md border px-3 py-1.5 text-xs ${calendarPreferences.allowsDoubleSessions === option.value ? "border-[#d4a54f] bg-[#d4a54f]/15 text-[#d4a54f]" : "border-[#30363d] bg-[#161b22] text-[#8f99a8]"}`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-medium text-[#c9d1d9]">O que deve ter prioridade quando a semana aperta?</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {[
                            { label: "Equilíbrio", value: "balanced" as const },
                            { label: "Força", value: "strength" as const },
                            { label: "Corrida", value: "running" as const },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setCalendarPreferences((current) => ({ ...current, priority: option.value }))}
                              className={`rounded-md border px-3 py-1.5 text-xs ${calendarPreferences.priority === option.value ? "border-[#d4a54f] bg-[#d4a54f]/15 text-[#d4a54f]" : "border-[#30363d] bg-[#161b22] text-[#8f99a8]"}`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleSaveCalendarPreferences()}
                        className="rounded-lg border border-[#d4a54f] bg-[#d4a54f]/15 px-3 py-2 text-xs font-semibold text-[#d4a54f]"
                      >
                        Guardar preferências
                      </button>
                    </div>
                  </div>
                )}

                {alternativePresets.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-3 text-xs text-[#8f99a8]">Se precisares, podes trocar para outra versão compatível:</p>
                    <div className="space-y-3">
                      {alternativePresets.map((preset) => (
                        <PresetCard
                          key={preset.id}
                          preset={preset}
                          sessions={sessions}
                          onSelect={() => {
                            if (!selectedSetupVariant) {
                              handleOpenPresetGeneration(preset.id);
                              return;
                            }
                            openGenerationModal(preset.id, selectedSetupVariant.id);
                          }}
                          generating={generating}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!planLoading && !hasPlan && presets.length > 0 && variants.length === 0 && selectedProgram?.presetSelection !== "coach" && (
          <div className="mt-6">
            <h2 className="mb-3 text-lg font-semibold text-[#f7f1e8]">
              Escolhe a versão da tua semana
            </h2>
            <p className="mb-4 text-xs text-[#8f99a8]">
              Seleciona o calendário semanal que melhor se adapta à tua disponibilidade.
            </p>
            <div className="space-y-3">
              {presets.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  sessions={sessions}
                  onSelect={() => handleOpenPresetGeneration(preset.id)}
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
            <div className="mb-4 flex items-center justify-between rounded-xl border border-[#30363d] bg-[#161b22] p-2">
              <button
                onClick={() => setViewMode("multi-week")}
                className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs font-semibold text-[#c9d1d9]"
                title="Ver multi-semanal"
              >
                ◰ Multi
              </button>
              <button
                onClick={() => setViewMode("week")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  viewMode === "week"
                    ? "border-[#d4a54f] bg-[#d4a54f]/15 text-[#d4a54f]"
                    : "border-[#30363d] bg-[#0d1117] text-[#c9d1d9]"
                }`}
              >
                Semana
              </button>
              <button
                onClick={() => setViewMode("day")}
                disabled={!selectedBundle}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  viewMode === "day"
                    ? "border-[#d4a54f] bg-[#d4a54f]/15 text-[#d4a54f]"
                    : "border-[#30363d] bg-[#0d1117] text-[#c9d1d9]"
                } disabled:opacity-40`}
              >
                Dia
              </button>
            </div>

            {viewMode === "multi-week" && (
              <MultiWeekView
                weekBundles={weekBundles}
                selectedWeek={selectedWeek}
                onSelectWeek={(week) => {
                  setSelectedWeek(week);
                  setViewMode("week");
                }}
              />
            )}

            {viewMode === "week" && selectedBundle && (
              <WeeklyView
                bundle={selectedBundle}
                weekNumbers={weekNumbers}
                onPrevWeek={() => {
                  const idx = weekNumbers.indexOf(selectedWeek);
                  if (idx > 0) setSelectedWeek(weekNumbers[idx - 1]);
                }}
                onNextWeek={() => {
                  const idx = weekNumbers.indexOf(selectedWeek);
                  if (idx >= 0 && idx < weekNumbers.length - 1) setSelectedWeek(weekNumbers[idx + 1]);
                }}
                hasPrev={weekNumbers.indexOf(selectedWeek) > 0}
                hasNext={weekNumbers.indexOf(selectedWeek) >= 0 && weekNumbers.indexOf(selectedWeek) < weekNumbers.length - 1}
                selectedDay={selectedDay}
                onSelectDay={(day) => {
                  setSelectedDay(day);
                  setViewMode("day");
                }}
              />
            )}

            {viewMode === "day" && selectedBundle && (
              <DayView
                bundle={selectedBundle}
                selectedDay={selectedDay}
                rows={selectedDayRows}
                onBackToWeek={() => setViewMode("week")}
                onOpenStrength={(row) => handleSessionTap(row, navigate)}
                onMoveSession={handleOpenMoveModal}
              />
            )}

            {!selectedBundle && (
              <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 text-center text-sm text-[#8f99a8]">
                Semana não encontrada.
              </div>
            )}

          </div>
        )}

        {pendingPresetId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-sm rounded-xl border border-[#30363d] bg-[#161b22] p-4">
              <h3 className="text-base font-semibold text-[#f7f1e8]">Confirmar início do calendário</h3>
              <p className="mt-1 text-xs text-[#8f99a8]">
                Escolhe quando queres começar e confirma a primeira semana antes de gerar o calendário.
              </p>

              <div className="mt-4 space-y-3">
                <label className="block text-xs text-[#8f99a8]">
                  Começar em
                  <input
                    type="date"
                    value={pendingStartDate}
                    min={resolveDefaultGenerationStartDate()}
                    onChange={(e) => setPendingStartDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-sm text-[#c9d1d9]"
                  />
                </label>

                <div className="rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs text-[#8f99a8]">
                  <p className="font-medium text-[#c9d1d9]">Preview da 1ª semana</p>
                  <p className="mt-1">
                    A primeira semana só mostra sessões em ou depois de {formatDatePtLong(pendingStartDate)}.
                  </p>
                  <div className="mt-2 space-y-1">
                    {pendingPreviewRows.length > 0 ? pendingPreviewRows.map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-2 rounded bg-[#161b22] px-2 py-1">
                        <span>{formatDatePtLong(row.dateIso)}</span>
                        <span className="truncate text-right text-[#c9d1d9]">{row.label}</span>
                      </div>
                    )) : (
                      <p>Não há sessões elegíveis nessa primeira semana com a data escolhida.</p>
                    )}
                  </div>
                </div>

                {needsRunningConfig && (
                  <>
                    <label className="block text-xs text-[#8f99a8]">
                      Volume semanal inicial (km)
                      <input
                        type="number"
                        min={5}
                        max={300}
                        step={0.5}
                        value={runVolumeConfig.initialWeeklyVolumeKm}
                        onChange={(e) => setRunVolumeConfig((prev) => ({ ...prev, initialWeeklyVolumeKm: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-sm text-[#c9d1d9]"
                      />
                    </label>

                    <label className="block text-xs text-[#8f99a8]">
                      Progressão semanal (%)
                      <input
                        type="number"
                        min={-5}
                        max={20}
                        step={0.5}
                        value={runVolumeConfig.weeklyProgressionPct}
                        onChange={(e) => setRunVolumeConfig((prev) => ({ ...prev, weeklyProgressionPct: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-sm text-[#c9d1d9]"
                      />
                    </label>

                    <label className="block text-xs text-[#8f99a8]">
                      Periodização
                      <select
                        value={runVolumeConfig.periodizationType}
                        onChange={(e) => setRunVolumeConfig((prev) => ({
                          ...prev,
                          periodizationType: e.target.value as "linear" | "undulating" | "block",
                        }))}
                        className="mt-1 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-sm text-[#c9d1d9]"
                      >
                        <option value="undulating">Ondulatória</option>
                        <option value="linear">Linear</option>
                        <option value="block">Blocos</option>
                      </select>
                    </label>
                  </>
                )}
              </div>

              {runVolumeConfigError && (
                <div className="mt-3 rounded border border-[#7c1f1f] bg-[#2a1111] px-3 py-2 text-xs text-[#ffd4d4]">
                  {runVolumeConfigError}
                </div>
              )}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingPresetId(null);
                    setPendingVariantId(null);
                    setRunVolumeConfigError(null);
                  }}
                  className="rounded-md border border-[#30363d] px-3 py-1.5 text-xs text-[#c9d1d9]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => void handleConfirmGeneration()}
                  className="rounded-md border border-[#d4a54f] bg-[#d4a54f]/20 px-3 py-1.5 text-xs font-semibold text-[#d4a54f] disabled:opacity-50"
                >
                  {generating ? "A gerar..." : "Gerar calendário"}
                </button>
              </div>
            </div>
          </div>
        )}

        {movingRow && selectedBundle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-sm rounded-xl border border-[#30363d] bg-[#161b22] p-4">
              <h3 className="text-base font-semibold text-[#f7f1e8]">Mover treino</h3>
              <p className="mt-1 text-xs text-[#8f99a8]">
                Escolhe o novo dia para <span className="font-medium text-[#c9d1d9]">{movingRow.session_label}</span>.
              </p>
              <p className="mt-1 text-[11px] text-[#5f6b7a]">
                Slot {movingRow.time_slot}. Dias com sessão no mesmo slot estão bloqueados.
              </p>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {DAY_LABELS.map((label, idx) => {
                  const blocked = occupiedMoveDays.has(idx);
                  const current = idx === movingRow.day_of_week;
                  const selected = idx === moveTargetDay;
                  return (
                    <button
                      key={`${label}-${idx}`}
                      type="button"
                      disabled={blocked || current || movingBusy}
                      onClick={() => setMoveTargetDay(idx)}
                      className={`rounded-md border px-2 py-1.5 text-xs transition ${
                        selected
                          ? "border-[#d4a54f] bg-[#d4a54f]/20 text-[#d4a54f]"
                          : "border-[#30363d] bg-[#0d1117] text-[#c9d1d9]"
                      } disabled:cursor-not-allowed disabled:opacity-35`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMovingRow(null)}
                  disabled={movingBusy}
                  className="rounded-md border border-[#30363d] px-3 py-1.5 text-xs text-[#c9d1d9]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmMove()}
                  disabled={movingBusy || moveTargetDay === movingRow.day_of_week}
                  className="rounded-md border border-[#d4a54f] bg-[#d4a54f]/20 px-3 py-1.5 text-xs font-semibold text-[#d4a54f] disabled:opacity-50"
                >
                  {movingBusy ? "A mover..." : "Confirmar"}
                </button>
              </div>
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
                const color = sess ? SESSION_THEME[sess.session_type]?.badge || SESSION_THEME.other.badge : "bg-zinc-800";
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

function MultiWeekView({
  weekBundles,
  selectedWeek,
  onSelectWeek,
}: {
  weekBundles: WeekBundle[];
  selectedWeek: number;
  onSelectWeek: (weekNumber: number) => void;
}) {
  return (
    <div className="space-y-3">
      {weekBundles.map((bundle) => (
        <button
          key={bundle.weekNumber}
          onClick={() => onSelectWeek(bundle.weekNumber)}
          className={`w-full rounded-xl border p-3 text-left transition ${
            selectedWeek === bundle.weekNumber
              ? "border-[#d4a54f] bg-[#1a1f27]"
              : "border-[#30363d] bg-[#161b22] hover:border-[#d4a54f]/40"
          }`}
        >
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#f7f1e8]">Semana {bundle.weekNumber}</p>
              <p className="text-[11px] text-[#8f99a8]">Início {formatDatePt(bundle.weekStartDate)}</p>
            </div>
            <div className="text-right text-[11px] text-[#8f99a8]">
              <p>{bundle.summary.doneMinutes}/{bundle.summary.plannedMinutes} min</p>
              <p>Força {bundle.summary.doneStrength}/{bundle.summary.plannedStrength}</p>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {bundle.days.map((rows, dayIdx) => (
              <MultiWeekDayCell key={`${bundle.weekNumber}-${dayIdx}`} dayIndex={dayIdx} rows={rows} />
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between text-[10px] text-[#8f99a8]">
            <span>TSS: em breve</span>
            <span>Planeado vs done</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function MultiWeekDayCell({ dayIndex, rows }: { dayIndex: number; rows: WeeklyPlanRow[] }) {
  const sport = pickDaySport(rows);
  const names = rows.slice(0, 2).map((row) => row.session_label);
  const extraCount = Math.max(0, rows.length - names.length);

  return (
    <div className="relative min-h-16 overflow-hidden rounded-lg border border-[#2b3138] bg-[#0d1117] p-1.5">
      <div className="pointer-events-none absolute inset-0 opacity-25">
        <SportBackgroundSvg sport={sport} />
      </div>
      <p className="relative text-[9px] font-semibold uppercase tracking-wide text-[#8f99a8]">{DAY_LABELS[dayIndex]}</p>
      <div className="relative mt-1 space-y-0.5">
        {names.length > 0 ? (
          names.map((name) => (
            <p key={name} className="truncate text-[9px] leading-tight text-[#d0d7de]">{name}</p>
          ))
        ) : (
          <p className="text-[9px] text-[#5b6573]">Sem treino</p>
        )}
        {extraCount > 0 && <p className="text-[8px] text-[#8f99a8]">+{extraCount}</p>}
      </div>
    </div>
  );
}

function WeeklyView({
  bundle,
  weekNumbers,
  onPrevWeek,
  onNextWeek,
  hasPrev,
  hasNext,
  selectedDay,
  onSelectDay,
}: {
  bundle: WeekBundle;
  weekNumbers: number[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  selectedDay: number;
  onSelectDay: (day: number) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={onPrevWeek}
          disabled={!hasPrev}
          className="rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-sm text-[#c9d1d9] disabled:opacity-40"
        >
          ←
        </button>
        <span className="flex-1 text-center text-sm font-semibold text-[#c9d1d9]">
          Semana {bundle.weekNumber}
          <span className="ml-2 text-xs text-[#8f99a8]">({formatDatePt(bundle.weekStartDate)})</span>
        </span>
        <button
          onClick={onNextWeek}
          disabled={!hasNext}
          className="rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-sm text-[#c9d1d9] disabled:opacity-40"
        >
          →
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <SummaryMetricCard label="Minutos" value={`${bundle.summary.doneMinutes}/${bundle.summary.plannedMinutes}`} helper="done/planeado" />
        <SummaryMetricCard label="Força" value={`${bundle.summary.doneStrength}/${bundle.summary.plannedStrength}`} helper="sessões concluídas" />
      </div>

      <div className="grid grid-cols-7 gap-1">
        {bundle.days.map((rows, dayIndex) => {
          const sport = pickDaySport(rows);
          const dayDate = formatDatePt(getDateForDay(bundle.weekStartDate, dayIndex));
          const isSelected = selectedDay === dayIndex;
          return (
            <button
              key={`${bundle.weekNumber}-${dayIndex}`}
              onClick={() => onSelectDay(dayIndex)}
              className={`relative min-h-28 overflow-hidden rounded-lg border p-1 text-left ${
                isSelected
                  ? "border-[#d4a54f] bg-[#20262f]"
                  : "border-[#30363d] bg-[#121820]"
              }`}
            >
              <div className="pointer-events-none absolute inset-0 opacity-20">
                <SportBackgroundSvg sport={sport} />
              </div>
              <div className="relative mb-1 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#c9d1d9]">{DAY_LABELS[dayIndex]}</p>
                <p className="text-[8px] text-[#8f99a8]">{dayDate}</p>
              </div>

              <div className="relative space-y-1">
                {rows.length > 0 ? (
                  rows.slice(0, 3).map((row) => (
                    <WeeklySessionBadge key={row.id} row={row} />
                  ))
                ) : (
                  <div className="rounded-md bg-[#0d1117] px-1 py-1 text-[9px] text-[#5b6573]">Sem treino</div>
                )}
                {rows.length > 3 && <p className="text-[8px] text-[#8f99a8]">+{rows.length - 3} sessões</p>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-center text-[10px] text-[#8f99a8]">
        Semana principal ativa entre {weekNumbers[0]} e {weekNumbers[weekNumbers.length - 1]}
      </div>
    </div>
  );
}

function DayView({
  bundle,
  selectedDay,
  rows,
  onBackToWeek,
  onOpenStrength,
  onMoveSession,
}: {
  bundle: WeekBundle;
  selectedDay: number;
  rows: WeeklyPlanRow[];
  onBackToWeek: () => void;
  onOpenStrength: (row: WeeklyPlanRow) => void;
  onMoveSession: (row: WeeklyPlanRow) => void;
}) {
  const dayDate = formatDatePt(getDateForDay(bundle.weekStartDate, selectedDay));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between rounded-xl border border-[#30363d] bg-[#161b22] p-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#8f99a8]">Detalhe diário</p>
          <h3 className="text-lg font-semibold text-[#f7f1e8]">
            {DAY_LABELS[selectedDay]} {dayDate}
          </h3>
        </div>
        <button
          onClick={onBackToWeek}
          className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs font-semibold text-[#c9d1d9]"
        >
          Voltar semana
        </button>
      </div>

      <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
        {rows.length > 0 ? (
          rows.map((row) => (
            <DaySessionCard key={row.id} row={row} onOpenStrength={onOpenStrength} onMoveSession={onMoveSession} />
          ))
        ) : (
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 text-sm text-[#8f99a8]">
            Não existem treinos para este dia.
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryMetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-[#8f99a8]">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#f7f1e8]">{value}</p>
      <p className="text-[10px] text-[#8f99a8]">{helper}</p>
    </div>
  );
}

function WeeklySessionBadge({ row }: { row: WeeklyPlanRow }) {
  const theme = SESSION_THEME[row.session_type] || SESSION_THEME.other;
  const statusIcon = row.status === "completed"
    ? "✓"
    : row.status === "skipped"
      ? (row.is_optional ? "◦" : "✕")
      : "•";

  return (
    <div className={`rounded-md border px-1 py-1 text-[9px] leading-tight ${theme.badge}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[#e6edf3]">{row.session_label}</span>
        <span className="text-[#8f99a8]">{statusIcon}</span>
      </div>
    </div>
  );
}

function DaySessionCard({
  row,
  onOpenStrength,
  onMoveSession,
}: {
  row: WeeklyPlanRow;
  onOpenStrength: (row: WeeklyPlanRow) => void;
  onMoveSession: (row: WeeklyPlanRow) => void;
}) {
  const theme = SESSION_THEME[row.session_type] || SESSION_THEME.other;
  const canStartStrength = row.session_type === "strength" && !!row.strength_instance_id;
  const canMove = row.status === "planned";

  return (
    <article className={`rounded-xl border bg-[#161b22] p-3 ${row.is_optional ? "border-dashed border-[#6b7280]" : "border-[#30363d]"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[#f7f1e8]">{row.session_label}</h4>
        <div className="flex items-center gap-1.5">
          {row.is_optional && (
            <span className="rounded-full border border-[#6b7280] bg-[#374151]/30 px-2 py-0.5 text-[10px] font-semibold text-[#c9d1d9]">
              opcional
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${theme.chip}`}>
            {row.session_type}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] text-[#8f99a8]">
        <p>Slot: {row.time_slot}</p>
        <p>Estado: {row.status}</p>
        <p>Duração: {row.duration_estimate_min || 0} min</p>
        <p>Intensidade: {row.intensity || "-"}</p>
      </div>

      {row.coach_notes && (
        <p className="mt-2 rounded-md bg-[#0d1117] p-2 text-xs text-[#c9d1d9]">{row.coach_notes}</p>
      )}

      {canStartStrength && (
        <button
          onClick={() => onOpenStrength(row)}
          className="mt-3 w-full rounded-lg border border-blue-600 bg-blue-600/15 px-3 py-2 text-xs font-semibold text-blue-100 transition hover:bg-blue-600/25"
        >
          Iniciar treino de força
        </button>
      )}

      {canMove && (
        <button
          onClick={() => onMoveSession(row)}
          className="mt-2 w-full rounded-lg border border-[#d4a54f] bg-[#d4a54f]/10 px-3 py-2 text-xs font-semibold text-[#d4a54f] transition hover:bg-[#d4a54f]/20"
        >
          Mover para outro dia
        </button>
      )}
    </article>
  );
}

function SportBackgroundSvg({ sport }: { sport: string }) {
  if (sport === "strength") {
    return (
      <svg viewBox="0 0 120 80" className="h-full w-full">
        <rect x="6" y="34" width="16" height="12" fill="#60a5fa" />
        <rect x="98" y="34" width="16" height="12" fill="#60a5fa" />
        <rect x="24" y="38" width="72" height="4" fill="#93c5fd" />
      </svg>
    );
  }

  if (sport === "running") {
    return (
      <svg viewBox="0 0 120 80" className="h-full w-full">
        <path d="M6 58 C26 48, 46 60, 66 50 C82 42, 100 54, 114 44" stroke="#34d399" strokeWidth="4" fill="none" />
        <circle cx="30" cy="28" r="6" fill="#6ee7b7" />
      </svg>
    );
  }

  if (sport === "cycling") {
    return (
      <svg viewBox="0 0 120 80" className="h-full w-full">
        <circle cx="34" cy="50" r="14" stroke="#f59e0b" strokeWidth="3" fill="none" />
        <circle cx="86" cy="50" r="14" stroke="#f59e0b" strokeWidth="3" fill="none" />
        <path d="M34 50 L54 36 L66 50 L86 50" stroke="#fbbf24" strokeWidth="3" fill="none" />
      </svg>
    );
  }

  if (sport === "mobility" || sport === "recovery") {
    return (
      <svg viewBox="0 0 120 80" className="h-full w-full">
        <ellipse cx="60" cy="44" rx="42" ry="16" fill="#22d3ee" />
        <ellipse cx="60" cy="44" rx="24" ry="8" fill="#67e8f9" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 80" className="h-full w-full">
      <rect x="18" y="18" width="84" height="44" rx="8" fill="#6b7280" />
    </svg>
  );
}

function handleSessionTap(row: WeeklyPlanRow, navigate: ReturnType<typeof useNavigate>) {
  if (row.session_type === "strength" && row.strength_instance_id) {
    navigate(
      `/atleta/forca?instanceId=${row.strength_instance_id}&day=${row.strength_day_number || 1}&week=${row.strength_week_number || row.week_number}`
    );
  }
}
