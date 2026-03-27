import { useCallback, useEffect, useMemo, useState } from "react";
import { signInWithGoogle, supabase } from "@/lib/supabase";
import {
  assignPlanToAthlete,
  createStrengthPlan,
  getStrengthPlanFull,
  listCoachAthletes,
  listCoachExercises,
  listStrengthPlans,
  saveStrengthPlanContent,
  type CoachAthlete,
  type CoachExercise,
  type CoachPlanExercise,
  type CoachPrescription,
  type StrengthPlanTemplate,
} from "@/services/coach-strength";

type FilterStatus = "all" | "draft" | "active" | "completed" | "archived";
type EditableExercise = CoachPlanExercise & { _uiId: string };
type EditablePrescription = CoachPrescription & { _uiId: string };

const SECTIONS = ["warm_up", "plyos_speed", "main", "conditioning", "observations"] as const;

function makeUiId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function CoachForcaPage() {
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingExercises, setSavingExercises] = useState(false);
  const [savingPrescriptions, setSavingPrescriptions] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);

  const [plans, setPlans] = useState<StrengthPlanTemplate[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [totalWeeks, setTotalWeeks] = useState(4);
  const [loadRound, setLoadRound] = useState(2.5);

  const [exerciseCatalog, setExerciseCatalog] = useState<CoachExercise[]>([]);
  const [athletes, setAthletes] = useState<CoachAthlete[]>([]);

  const [draftExercises, setDraftExercises] = useState<EditableExercise[]>([]);
  const [deletedExerciseIds, setDeletedExerciseIds] = useState<string[]>([]);
  const [draftPrescriptions, setDraftPrescriptions] = useState<EditablePrescription[]>([]);

  const [assignAthleteId, setAssignAthleteId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState("");
  const [assignLoadRound, setAssignLoadRound] = useState(2.5);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) || null,
    [plans, selectedPlanId]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setHasSession(Boolean(session));

      if (!session) {
        setPlans([]);
        return;
      }

      const [nextPlans, nextExercises, nextAthletes] = await Promise.all([
        listStrengthPlans(filter === "all" ? undefined : filter),
        listCoachExercises(),
        listCoachAthletes(),
      ]);

      setPlans(nextPlans);
      setExerciseCatalog(nextExercises);
      setAthletes(nextAthletes);

      if (selectedPlanId && !nextPlans.some((p) => p.id === selectedPlanId)) {
        setSelectedPlanId(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [filter, selectedPlanId]);

  const loadPlanDetail = useCallback(async (planId: string) => {
    setError(null);
    setSuccess(null);
    try {
      const full = await getStrengthPlanFull(planId);
      setDraftExercises(
        (full.exercises || []).map((ex) => ({
          ...ex,
          _uiId: ex.id || makeUiId(),
        }))
      );
      setDraftPrescriptions(
        (full.prescriptions || []).map((rx) => ({
          ...rx,
          _uiId: rx.id || `${rx.plan_exercise_id}-${rx.week_number}-${makeUiId()}`,
        }))
      );
      setDeletedExerciseIds([]);
      setAssignLoadRound(full.plan.load_round || 2.5);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar detalhe do plano");
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (selectedPlanId) {
      loadPlanDetail(selectedPlanId);
    }
  }, [loadPlanDetail, selectedPlanId]);

  const stats = useMemo(
    () => ({
      total: plans.length,
      drafts: plans.filter((p) => p.status === "draft").length,
      active: plans.filter((p) => p.status === "active").length,
      archived: plans.filter((p) => p.status === "archived").length,
    }),
    [plans]
  );

  const exerciseNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ex of exerciseCatalog) map.set(ex.id, ex.name);
    return map;
  }, [exerciseCatalog]);

  const handleCreatePlan = useCallback(async () => {
    if (!name.trim()) {
      setError("Nome é obrigatório");
      return;
    }
    if (totalWeeks < 1 || totalWeeks > 52) {
      setError("Total de semanas deve estar entre 1 e 52");
      return;
    }

    setSavingPlan(true);
    setError(null);
    setSuccess(null);
    try {
      const plan = await createStrengthPlan({
        name: name.trim(),
        description: description.trim() || undefined,
        total_weeks: totalWeeks,
        load_round: loadRound,
      });

      setName("");
      setDescription("");
      setTotalWeeks(4);
      setLoadRound(2.5);
      setSuccess("Template criado com sucesso");
      await loadAll();
      setSelectedPlanId(plan.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao criar plano");
    } finally {
      setSavingPlan(false);
    }
  }, [description, loadAll, loadRound, name, totalWeeks]);

  const addExercise = () => {
    if (!selectedPlanId || exerciseCatalog.length === 0) return;

    const maxOrder =
      draftExercises.length > 0
        ? Math.max(...draftExercises.map((ex) => ex.exercise_order || 0))
        : 0;

    setDraftExercises((prev) => [
      ...prev,
      {
        _uiId: makeUiId(),
        plan_id: selectedPlanId,
        day_number: 1,
        section: "main",
        superset_group: null,
        exercise_order: maxOrder + 1,
        exercise_id: exerciseCatalog[0].id,
        each_side: false,
        weight_per_side: false,
        plyo_mechanical_load: null,
        rm_percent_increase_per_week: null,
      },
    ]);
  };

  const updateExercise = (uiId: string, patch: Partial<EditableExercise>) => {
    setDraftExercises((prev) =>
      prev.map((ex) => (ex._uiId === uiId ? { ...ex, ...patch } : ex))
    );
  };

  const removeExercise = (uiId: string) => {
    setDraftExercises((prev) => {
      const found = prev.find((e) => e._uiId === uiId);
      if (found?.id) {
        setDeletedExerciseIds((curr) => (curr.includes(found.id!) ? curr : [...curr, found.id!]));
      }
      return prev.filter((e) => e._uiId !== uiId);
    });

    setDraftPrescriptions((prev) => {
      const removedPlanEx = draftExercises.find((e) => e._uiId === uiId);
      if (!removedPlanEx?.id) return prev;
      return prev.filter((rx) => rx.plan_exercise_id !== removedPlanEx.id);
    });
  };

  const saveExercises = useCallback(async () => {
    if (!selectedPlanId) return;
    setSavingExercises(true);
    setError(null);
    setSuccess(null);
    try {
      const payloadExercises: CoachPlanExercise[] = draftExercises.map((ex) => ({
        ...(ex.id ? { id: ex.id } : {}),
        plan_id: selectedPlanId,
        day_number: Number(ex.day_number),
        section: ex.section,
        superset_group: ex.superset_group || null,
        exercise_order: Number(ex.exercise_order),
        exercise_id: ex.exercise_id,
        each_side: Boolean(ex.each_side),
        weight_per_side: Boolean(ex.weight_per_side),
        plyo_mechanical_load: ex.plyo_mechanical_load || null,
        rm_percent_increase_per_week: ex.rm_percent_increase_per_week ?? null,
        alt_progression_exercise_id: ex.alt_progression_exercise_id || null,
        alt_regression_exercise_id: ex.alt_regression_exercise_id || null,
      }));

      await saveStrengthPlanContent({
        plan_id: selectedPlanId,
        exercises: payloadExercises,
        delete_exercise_ids: deletedExerciseIds,
      });

      setDeletedExerciseIds([]);
      setSuccess("Exercícios guardados");
      await loadPlanDetail(selectedPlanId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao guardar exercícios");
    } finally {
      setSavingExercises(false);
    }
  }, [deletedExerciseIds, draftExercises, loadPlanDetail, selectedPlanId]);

  const addPrescription = () => {
    const firstExercise = draftExercises[0];
    if (!firstExercise?.id) {
      setError("Guarda os exercícios primeiro para gerar IDs de plano_exercise");
      return;
    }
    const planExerciseId = firstExercise.id;
    setDraftPrescriptions((prev) => [
      ...prev,
      {
        _uiId: makeUiId(),
        plan_exercise_id: planExerciseId,
        week_number: 1,
        prescription_type: "reps",
        sets: 3,
        reps: 10,
        reps_min: null,
        reps_max: null,
        duration_seconds: null,
        rest_seconds: 90,
        rir: 2,
        tempo: null,
        gct: null,
        method: "standard",
        rm_percent_override: null,
        load_override_kg: null,
        coach_notes: null,
      },
    ]);
  };

  const updatePrescription = (uiId: string, patch: Partial<EditablePrescription>) => {
    setDraftPrescriptions((prev) =>
      prev.map((rx) => (rx._uiId === uiId ? { ...rx, ...patch } : rx))
    );
  };

  const removePrescription = (uiId: string) => {
    setDraftPrescriptions((prev) => prev.filter((rx) => rx._uiId !== uiId));
  };

  const savePrescriptions = useCallback(async () => {
    if (!selectedPlanId) return;
    setSavingPrescriptions(true);
    setError(null);
    setSuccess(null);
    try {
      const clean: CoachPrescription[] = draftPrescriptions
        .filter((rx) => rx.plan_exercise_id)
        .map((rx) => ({
          ...(rx.id ? { id: rx.id } : {}),
          plan_exercise_id: rx.plan_exercise_id,
          week_number: Number(rx.week_number),
          prescription_type: rx.prescription_type,
          sets: Number(rx.sets),
          reps: rx.reps ?? null,
          reps_min: rx.reps_min ?? null,
          reps_max: rx.reps_max ?? null,
          duration_seconds: rx.duration_seconds ?? null,
          rest_seconds: rx.rest_seconds ?? null,
          rir: rx.rir ?? null,
          tempo: rx.tempo || null,
          gct: rx.gct || null,
          method: rx.method || "standard",
          rm_percent_override: rx.rm_percent_override ?? null,
          load_override_kg: rx.load_override_kg ?? null,
          coach_notes: rx.coach_notes || null,
        }));

      await saveStrengthPlanContent({
        plan_id: selectedPlanId,
        prescriptions: clean,
      });

      setSuccess("Prescrições guardadas");
      await loadPlanDetail(selectedPlanId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao guardar prescrições");
    } finally {
      setSavingPrescriptions(false);
    }
  }, [draftPrescriptions, loadPlanDetail, selectedPlanId]);

  const assignPlan = useCallback(async () => {
    if (!selectedPlanId || !assignAthleteId) {
      setError("Seleciona plano e atleta");
      return;
    }
    setAssigning(true);
    setError(null);
    setSuccess(null);
    try {
      await assignPlanToAthlete({
        plan_id: selectedPlanId,
        athlete_id: assignAthleteId,
        start_date: assignStartDate || null,
        load_round: assignLoadRound,
      });
      setSuccess("Plano atribuído ao atleta");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao atribuir plano");
    } finally {
      setAssigning(false);
    }
  }, [assignAthleteId, assignLoadRound, assignStartDate, selectedPlanId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[radial-gradient(circle_at_top,rgba(212,165,79,0.14),#1a1a1a_46%,#090909)] px-6 text-center">
        <h1 className="font-['Oswald'] text-4xl font-semibold text-[#f7f1e8]">
          Coach <span className="text-[#d4a54f]">Força</span>
        </h1>
        <p className="max-w-xs text-sm text-[#8f99a8]">
          Entra com a tua conta Google para gerir templates de treino de força.
        </p>
        <button
          onClick={() => signInWithGoogle("/coach")}
          className="rounded-full bg-white px-6 py-3 text-sm font-medium text-gray-900 shadow-[0_12px_30px_rgba(0,0,0,0.4)]"
        >
          Entrar com Google
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(212,165,79,0.14),#1a1a1a_46%,#090909)] px-4 pb-12 pt-10 text-[#f7f1e8] md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-['Oswald'] text-4xl font-semibold tracking-wide text-[#f7f1e8]">
              Planos de Força
            </h1>
            <p className="mt-2 text-sm text-[#8f99a8]">
              Fase 4: templates, exercícios, prescrições e atribuição.
            </p>
          </div>
          <button
            onClick={() => loadAll()}
            className="rounded-xl border border-[#d4a54f55] bg-[#171717] px-4 py-2 text-sm text-[#f7f1e8]"
          >
            Atualizar
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 rounded-xl border border-[#d4a54f44] bg-[#d4a54f22] px-4 py-3 text-sm text-[#f7f1e8]">
            {success}
          </div>
        )}

        <div className="mb-8 grid gap-3 md:grid-cols-4">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Draft" value={stats.drafts} />
          <StatCard label="Ativos" value={stats.active} />
          <StatCard label="Arquivados" value={stats.archived} />
        </div>

        <section className="mb-8 rounded-2xl border border-[#d4a54f33] bg-[#171717]/90 p-5">
          <h2 className="mb-4 font-['Oswald'] text-2xl text-[#f7f1e8]">4.1 Criar template</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-[#8f99a8]">
              Nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Hipertrofia Lower/Upper"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[#f7f1e8] outline-none focus:border-[#d4a54f66]"
              />
            </label>
            <label className="text-sm text-[#8f99a8]">
              Semanas
              <input
                value={totalWeeks}
                onChange={(e) => setTotalWeeks(Number(e.target.value || 0))}
                type="number"
                min={1}
                max={52}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[#f7f1e8] outline-none focus:border-[#d4a54f66]"
              />
            </label>
            <label className="text-sm text-[#8f99a8]">
              Arredondamento de carga (kg)
              <input
                value={loadRound}
                onChange={(e) => setLoadRound(Number(e.target.value || 0))}
                type="number"
                min={0.5}
                step={0.5}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[#f7f1e8] outline-none focus:border-[#d4a54f66]"
              />
            </label>
            <label className="text-sm text-[#8f99a8] md:col-span-2">
              Descrição
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Objetivo, população, notas gerais"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[#f7f1e8] outline-none focus:border-[#d4a54f66]"
              />
            </label>
          </div>
          <button
            onClick={handleCreatePlan}
            disabled={savingPlan}
            className="mt-4 rounded-xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] px-5 py-2.5 font-['Oswald'] text-sm font-semibold text-[#111111] disabled:opacity-60"
          >
            {savingPlan ? "A criar..." : "Criar template"}
          </button>
        </section>

        <section className="mb-8">
          <div className="mb-4 flex flex-wrap gap-2">
            {(["all", "draft", "active", "completed", "archived"] as FilterStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium uppercase tracking-wide ${
                  filter === s
                    ? "bg-[#d4a54f] text-[#111111]"
                    : "border border-white/15 bg-black/20 text-[#b8beca]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`cursor-pointer rounded-xl border p-4 ${
                  selectedPlanId === plan.id
                    ? "border-[#d4a54f66] bg-[#2b2015]"
                    : "border-white/10 bg-black/25"
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="font-['Oswald'] text-xl text-[#f7f1e8]">{plan.name}</h3>
                  <span className="rounded-full bg-[#d4a54f22] px-2 py-0.5 text-[11px] uppercase tracking-wide text-[#d4a54f]">
                    {plan.status}
                  </span>
                </div>
                <p className="mb-3 line-clamp-2 text-sm text-[#8f99a8]">
                  {plan.description || "Sem descrição"}
                </p>
                <div className="text-xs text-[#b8beca]">
                  <p>{plan.total_weeks} semanas</p>
                  <p>Load round: {plan.load_round} kg</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {selectedPlan && (
          <>
            <section className="mb-8 rounded-2xl border border-[#d4a54f33] bg-[#171717]/90 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-['Oswald'] text-2xl text-[#f7f1e8]">
                  4.2 Exercícios do plano: {selectedPlan.name}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={addExercise}
                    className="rounded-lg border border-[#d4a54f44] px-3 py-1.5 text-xs text-[#d4a54f]"
                  >
                    + Exercício
                  </button>
                  <button
                    onClick={saveExercises}
                    disabled={savingExercises}
                    className="rounded-lg bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] px-3 py-1.5 text-xs font-semibold text-[#111111] disabled:opacity-60"
                  >
                    {savingExercises ? "A guardar..." : "Guardar exercícios"}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {draftExercises.map((ex) => (
                  <div key={ex._uiId} className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3 md:grid-cols-4">
                    <select
                      value={ex.exercise_id}
                      onChange={(e) => updateExercise(ex._uiId, { exercise_id: e.target.value })}
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                    >
                      {exerciseCatalog.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={ex.day_number}
                      onChange={(e) => updateExercise(ex._uiId, { day_number: Number(e.target.value || 1) })}
                      placeholder="Dia"
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                    />
                    <select
                      value={ex.section}
                      onChange={(e) =>
                        updateExercise(ex._uiId, {
                          section: e.target.value as CoachPlanExercise["section"],
                        })
                      }
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                    >
                      {SECTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={ex.exercise_order}
                      onChange={(e) => updateExercise(ex._uiId, { exercise_order: Number(e.target.value || 1) })}
                      placeholder="Ordem"
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                    />

                    <input
                      value={ex.superset_group || ""}
                      onChange={(e) =>
                        updateExercise(ex._uiId, {
                          superset_group: e.target.value.trim() || null,
                        })
                      }
                      placeholder="Superset (A/B)"
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                    />

                    <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(ex.each_side)}
                        onChange={(e) => updateExercise(ex._uiId, { each_side: e.target.checked })}
                      />
                      cada lado
                    </label>

                    <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs">
                      <input
                        type="checkbox"
                        checked={Boolean(ex.weight_per_side)}
                        onChange={(e) => updateExercise(ex._uiId, { weight_per_side: e.target.checked })}
                      />
                      peso por lado
                    </label>

                    <button
                      onClick={() => removeExercise(ex._uiId)}
                      className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-300"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-8 rounded-2xl border border-[#d4a54f33] bg-[#171717]/90 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-['Oswald'] text-2xl text-[#f7f1e8]">4.3 Prescrições semanais</h2>
                <div className="flex gap-2">
                  <button
                    onClick={addPrescription}
                    className="rounded-lg border border-[#d4a54f44] px-3 py-1.5 text-xs text-[#d4a54f]"
                  >
                    + Prescrição
                  </button>
                  <button
                    onClick={savePrescriptions}
                    disabled={savingPrescriptions}
                    className="rounded-lg bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] px-3 py-1.5 text-xs font-semibold text-[#111111] disabled:opacity-60"
                  >
                    {savingPrescriptions ? "A guardar..." : "Guardar prescrições"}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {draftPrescriptions.map((rx) => (
                  <div key={rx._uiId} className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3 md:grid-cols-4">
                    <select
                      value={rx.plan_exercise_id}
                      onChange={(e) => updatePrescription(rx._uiId, { plan_exercise_id: e.target.value })}
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                    >
                      {draftExercises
                        .filter((ex) => ex.id)
                        .map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            D{ex.day_number} · {exerciseNameById.get(ex.exercise_id) || ex.exercise_id}
                          </option>
                        ))}
                    </select>

                    <input
                      type="number"
                      min={1}
                      max={selectedPlan.total_weeks}
                      value={rx.week_number}
                      onChange={(e) => updatePrescription(rx._uiId, { week_number: Number(e.target.value || 1) })}
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                    />

                    <input
                      type="number"
                      min={1}
                      value={rx.sets}
                      onChange={(e) => updatePrescription(rx._uiId, { sets: Number(e.target.value || 1) })}
                      placeholder="Sets"
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                    />

                    <select
                      value={rx.prescription_type}
                      onChange={(e) =>
                        updatePrescription(rx._uiId, {
                          prescription_type: e.target.value as CoachPrescription["prescription_type"],
                        })
                      }
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                    >
                      <option value="reps">reps</option>
                      <option value="duration">duration</option>
                    </select>

                    {rx.prescription_type === "reps" ? (
                      <>
                        <input
                          type="number"
                          value={rx.reps ?? ""}
                          onChange={(e) =>
                            updatePrescription(rx._uiId, {
                              reps: e.target.value ? Number(e.target.value) : null,
                              duration_seconds: null,
                            })
                          }
                          placeholder="Reps"
                          className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                        />
                        <input
                          type="number"
                          value={rx.reps_min ?? ""}
                          onChange={(e) =>
                            updatePrescription(rx._uiId, {
                              reps_min: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          placeholder="Reps min"
                          className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                        />
                        <input
                          type="number"
                          value={rx.reps_max ?? ""}
                          onChange={(e) =>
                            updatePrescription(rx._uiId, {
                              reps_max: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          placeholder="Reps max"
                          className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                        />
                      </>
                    ) : (
                      <input
                        type="number"
                        value={rx.duration_seconds ?? ""}
                        onChange={(e) =>
                          updatePrescription(rx._uiId, {
                            duration_seconds: e.target.value ? Number(e.target.value) : null,
                            reps: null,
                            reps_min: null,
                            reps_max: null,
                          })
                        }
                        placeholder="Duração (s)"
                        className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                      />
                    )}

                    <input
                      type="number"
                      value={rx.rest_seconds ?? ""}
                      onChange={(e) =>
                        updatePrescription(rx._uiId, {
                          rest_seconds: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      placeholder="Descanso (s)"
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                    />

                    <input
                      value={rx.tempo || ""}
                      onChange={(e) => updatePrescription(rx._uiId, { tempo: e.target.value || null })}
                      placeholder="Tempo"
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                    />

                    <input
                      value={rx.method || "standard"}
                      onChange={(e) => updatePrescription(rx._uiId, { method: e.target.value || "standard" })}
                      placeholder="Método"
                      className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm"
                    />

                    <button
                      onClick={() => removePrescription(rx._uiId)}
                      className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-300"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-8 rounded-2xl border border-[#d4a54f33] bg-[#171717]/90 p-5">
              <h2 className="mb-4 font-['Oswald'] text-2xl text-[#f7f1e8]">4.4 Atribuir plano a atleta</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <select
                  value={assignAthleteId}
                  onChange={(e) => setAssignAthleteId(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm md:col-span-2"
                >
                  <option value="">Selecionar atleta</option>
                  {athletes.map((ath) => (
                    <option key={ath.id} value={ath.id}>
                      {ath.label}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  value={assignStartDate}
                  onChange={(e) => setAssignStartDate(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />

                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={assignLoadRound}
                  onChange={(e) => setAssignLoadRound(Number(e.target.value || 2.5))}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
              </div>

              <button
                onClick={assignPlan}
                disabled={assigning}
                className="mt-4 rounded-xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] px-5 py-2.5 font-['Oswald'] text-sm font-semibold text-[#111111] disabled:opacity-60"
              >
                {assigning ? "A atribuir..." : "Atribuir plano"}
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-wide text-[#8f99a8]">{label}</p>
      <p className="mt-1 font-['Oswald'] text-3xl text-[#f7f1e8]">{value}</p>
    </div>
  );
}
