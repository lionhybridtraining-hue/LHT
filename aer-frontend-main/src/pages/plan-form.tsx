import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ButtonGroup from "@/components/button-group";
import StepIndicator from "@/components/step-indicator";
import StepNavigation from "@/components/step-navigation";
import { mergeOnboardingAnswers } from "@/lib/onboarding-intake";
import {
  clearPlanLandingDraft,
  loadPlanLandingDraft,
  type PlanLandingDraft,
  loadPlanFormDraft,
  savePlanFormDraft,
  type PlanFormDraft,
} from "@/lib/planocorrida-draft";
import { getAccessToken, signInWithGoogle, supabase } from "@/lib/supabase";
import {
  AthleteLevel,
  calculateVDOT,
  formatMinPerKm,
  LEVEL_LABELS,
  paceFromVdot,
  progressionOptions,
  syntheticRaceTimeForVdot,
  vdotFromEasyPace,
  vdotFromThresholdPace,
  vdotToLevel,
  VDOT_TIERS,
} from "@/utils/vdot";

const COMMUNITY_URL = "https://chat.whatsapp.com/JVsqO05fm4kLhbSaSiKL8n";

type VdotPath = "race" | "pace" | "level";
type PaceType = "easy" | "threshold";

const PROGRAM_DISTANCES = [
  { label: "5K",      value: 5    },
  { label: "10K",     value: 10   },
  { label: "Meia",    value: 21.1 },
  { label: "Maratona",value: 42.2 },
];

const TRAINING_FREQS = [
  { label: "2x", value: 2 },
  { label: "3x", value: 3 },
  { label: "4x", value: 4 },
  { label: "5x", value: 5 },
];

const PHASE_DURATIONS = [
  { label: "4 semanas", value: 4, sublabel: "total 12 sem (3 fases)" },
  { label: "5 semanas", value: 5, sublabel: "total 15 sem (3 fases)" },
  { label: "6 semanas", value: 6, sublabel: "total 18 sem (3 fases)" },
];

const RACE_DIST_OPTIONS = [
  { label: "5K",    value: 5    },
  { label: "10K",   value: 10   },
  { label: "21.1K", value: 21.1 },
  { label: "42.2K", value: 42.2 },
];

/** "H:MM:SS" or "MM:SS" → decimal minutes. Returns undefined if invalid. */
function parseRaceTimeToMinutes(t: string): number | undefined {
  const match = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return undefined;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3] ?? 0);
  if (m > 59 || s > 59) return undefined;
  return h * 60 + m + s / 60;
}

/** "M:SS" → decimal min/km. Returns undefined if invalid. */
function parsePaceInput(pace: string): number | undefined {
  const match = pace.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const m = Number(match[1]);
  const s = Number(match[2]);
  if (!Number.isFinite(m) || s > 59) return undefined;
  return m + s / 60;
}

function PlanForm() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [syncingLanding, setSyncingLanding] = useState(false);

  // ── Secção 1: Objetivo ──────────────────────────────────────────────────────
  const [programDistance, setProgramDistance] = useState(10);
  const [trainingFrequency, setTrainingFrequency] = useState(3);

  // ── Secção 2: VDOT ─────────────────────────────────────────────────────────
  const [vdotPath, setVdotPath] = useState<VdotPath>("race");
  // Path A — prova
  const [raceDist, setRaceDist] = useState<number>(5);
  const [raceTimeStr, setRaceTimeStr] = useState("");
  // Path B — pace
  const [paceType, setPaceType] = useState<PaceType>("easy");
  const [paceStr, setPaceStr] = useState("");
  // Path C — patamar descritivo
  const [selectedTier, setSelectedTier] = useState<number | null>(null);

  // ── Secção 3: Progressão ────────────────────────────────────────────────────
  const [progressionRate, setProgressionRate] = useState<number | null>(null);

  // ── Secção 4: Duração ───────────────────────────────────────────────────────
  const [phaseDuration, setPhaseDuration] = useState(12);

  // ── Secção 5: Volume + meta ─────────────────────────────────────────────────
  const [initialVolume, setInitialVolume] = useState<number | "">("");
  const [name, setName] = useState("");
  const [weeklyCommitment, setWeeklyCommitment] = useState(false);

  // ── Multi-step form state ────────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState(1);
  const TOTAL_STEPS = 5;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setIsAuthenticated(Boolean(data.session?.user));
      setAuthChecked(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setIsAuthenticated(Boolean(session?.user));
      setAuthChecked(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const draft = loadPlanLandingDraft();
    if (!draft) return;

    hydrateFormWithDraft(draft, {
      setName,
      setProgramDistance,
      setTrainingFrequency,
    });
  }, []);

  // Load form draft from localStorage on mount
  useEffect(() => {
    const formDraft = loadPlanFormDraft();
    if (!formDraft) return;

    // Hydrate form with saved draft
    setProgramDistance(formDraft.programDistance);
    setTrainingFrequency(formDraft.trainingFrequency);
    setVdotPath(formDraft.vdotPath);
    setRaceDist(formDraft.raceDist);
    setRaceTimeStr(formDraft.raceTimeStr);
    setPaceType(formDraft.paceType);
    setPaceStr(formDraft.paceStr);
    setSelectedTier(formDraft.selectedTier);
    setProgressionRate(formDraft.progressionRate);
    setPhaseDuration(formDraft.phaseDuration);
    setInitialVolume(formDraft.initialVolume);
    setName(formDraft.name);
    setWeeklyCommitment(formDraft.weeklyCommitment);
    setCurrentStep(formDraft.currentStep);
  }, []);

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;

    const draft = loadPlanLandingDraft();
    if (!draft || draft.syncedAt) return;

    let isMounted = true;

    const syncLandingDraft = async () => {
      setSyncingLanding(true);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        await mergeOnboardingAnswers(accessToken, {
          planocorrida_landing: buildLandingPayload(draft),
        });

        if (!isMounted) return;
        clearPlanLandingDraft();
      } catch (error) {
        console.warn("Nao foi possivel sincronizar a landing inicial:", error);
      } finally {
        if (isMounted) {
          setSyncingLanding(false);
        }
      }
    };

    syncLandingDraft();

    return () => {
      isMounted = false;
    };
  }, [authChecked, isAuthenticated]);

  // ── VDOT derivado ───────────────────────────────────────────────────────────
  const estimatedVdot = useMemo<number | null>(() => {
    if (vdotPath === "race") {
      const t = parseRaceTimeToMinutes(raceTimeStr);
      if (!t || !raceDist) return null;
      const v = calculateVDOT(raceDist, t);
      return v > 10 ? v : null;
    }
    if (vdotPath === "pace") {
      const p = parsePaceInput(paceStr);
      if (!p) return null;
      const v =
        paceType === "threshold"
          ? vdotFromThresholdPace(p)
          : vdotFromEasyPace(p);
      return v > 10 ? v : null;
    }
    if (vdotPath === "level") {
      return selectedTier;
    }
    return null;
  }, [vdotPath, raceDist, raceTimeStr, paceType, paceStr, selectedTier]);

  const estimatedLevel = useMemo<AthleteLevel | null>(() => {
    if (estimatedVdot === null) return null;
    return vdotToLevel(estimatedVdot);
  }, [estimatedVdot]);

  const currentProgressionOptions = useMemo(() => {
    if (!estimatedLevel) return null;
    return progressionOptions(estimatedLevel);
  }, [estimatedLevel]);

  const estimatedPaces = useMemo(() => {
    if (estimatedVdot === null) return null;
    return {
      threshold: formatMinPerKm(paceFromVdot(estimatedVdot, 0.88)),
      easy: formatMinPerKm(paceFromVdot(estimatedVdot, 0.62)),
    };
  }, [estimatedVdot]);

  // Reset progression when the inferred level changes
  useEffect(() => {
    setProgressionRate(null);
  }, [estimatedLevel]);

  // ── Validação ───────────────────────────────────────────────────────────────
  
  /** Step 1: Objetivo — Validate distance and frequency */
  function validateStep1(): string | null {
    if (!programDistance || !trainingFrequency) {
      return "Por favor, seleciona a distância objetivo e frequência de treino.";
    }
    return null;
  }

  /** Step 2: VDOT — Validate VDOT path and estimated level */
  function validateStep2(): string | null {
    if (vdotPath === "race") {
      if (!parseRaceTimeToMinutes(raceTimeStr)) {
        return "Insere o tempo da prova no formato HH:MM:SS (ex.: 00:25:30).";
      }
    }
    if (vdotPath === "pace") {
      if (!parsePaceInput(paceStr)) {
        return "Insere o pace no formato MM:SS (ex.: 05:30).";
      }
    }
    if (vdotPath === "level" && selectedTier === null) {
      return "Seleciona o teu nivel de experiencia.";
    }
    if (estimatedVdot === null) {
      return "Nao foi possivel estimar o teu nivel. Verifica os dados inseridos.";
    }
    return null;
  }

  /** Step 3: Progressão — Validate progression rate */
  function validateStep3(): string | null {
    if (progressionRate === null) {
      return "Seleciona o ritmo de progressao semanal.";
    }
    return null;
  }

  /** Step 4: Duração — Validate phase duration */
  function validateStep4(): string | null {
    if (!phaseDuration) {
      return "Seleciona a duracao do plano.";
    }
    return null;
  }

  /** Step 5: Detalhes — Validate commitment */
  function validateStep5(): string | null {
    if (!weeklyCommitment) {
      return "Para continuar, confirma o teu compromisso semanal.";
    }
    return null;
  }

  /** Validate current step */
  function validateCurrentStep(): string | null {
    switch (currentStep) {
      case 1:
        return validateStep1();
      case 2:
        return validateStep2();
      case 3:
        return validateStep3();
      case 4:
        return validateStep4();
      case 5:
        return validateStep5();
      default:
        return null;
    }
  }

  /** Determine if we can advance to next step */
  const canAdvance = useMemo(() => {
    return validateCurrentStep() === null;
  }, [currentStep, programDistance, trainingFrequency, vdotPath, raceDist, raceTimeStr, paceType, paceStr, selectedTier, estimatedVdot, progressionRate, phaseDuration, weeklyCommitment]);

  /** Handle next step */
  function handleNext() {
    const error = validateCurrentStep();
    if (error) {
      setErrorMessage(error);
      return;
    }

    setErrorMessage(null);

    if (currentStep < TOTAL_STEPS) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      // Auto-save to localStorage
      saveDraftToLocalStorage(nextStep);
      // Scroll to top
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // Last step — submit form
      handleSubmit(new Event("submit") as unknown as FormEvent<HTMLFormElement>);
    }
  }

  /** Handle previous step */
  function handlePrev() {
    if (currentStep > 1) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      setErrorMessage(null);
      // Auto-save to localStorage
      saveDraftToLocalStorage(prevStep);
      // Scroll to top
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  /** Save current form state to localStorage as draft */
  function saveDraftToLocalStorage(step: number) {
    const draft: PlanFormDraft = {
      programDistance,
      trainingFrequency,
      vdotPath,
      raceDist,
      raceTimeStr,
      paceType,
      paceStr,
      selectedTier,
      progressionRate,
      phaseDuration,
      initialVolume,
      name,
      weeklyCommitment,
      currentStep: step,
      createdAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    };
    savePlanFormDraft(draft);
  }

  function validateForm(): string | null {
    if (!programDistance || !trainingFrequency || !phaseDuration) {
      return "Preenche os campos de objetivo e duracao.";
    }
    if (vdotPath === "race") {
      if (!parseRaceTimeToMinutes(raceTimeStr)) {
        return "Insere o tempo da prova no formato HH:MM:SS (ex.: 00:25:30).";
      }
    }
    if (vdotPath === "pace") {
      if (!parsePaceInput(paceStr)) {
        return "Insere o pace no formato MM:SS (ex.: 05:30).";
      }
    }
    if (vdotPath === "level" && selectedTier === null) {
      return "Seleciona o teu nivel de experiencia.";
    }
    if (estimatedVdot === null) {
      return "Nao foi possivel estimar o teu nivel. Verifica os dados inseridos.";
    }
    if (progressionRate === null) {
      return "Seleciona o ritmo de progressao semanal.";
    }
    if (!weeklyCommitment) {
      return "Para continuar, confirma o teu compromisso semanal.";
    }
    return null;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const error = validateForm();
    if (error) {
      setErrorMessage(error);
      return;
    }

    const params = new URLSearchParams();
    params.set("program_distance",   String(programDistance));
    params.set("training_frequency", String(trainingFrequency));
    params.set("phase_duration",     String(phaseDuration));
    params.set("progression_rate",   String(progressionRate!));

    // race_dist + race_time in MINUTES (as expected by the API)
    if (vdotPath === "race") {
      params.set("race_dist", String(raceDist));
      params.set("race_time", String(
        Math.round(parseRaceTimeToMinutes(raceTimeStr)! * 1000) / 1000
      ));
    } else {
      // Path B / C: derive synthetic 5 km race time from estimated VDOT
      params.set("race_dist", "5");
      params.set("race_time", String(syntheticRaceTimeForVdot(estimatedVdot!)));
    }

    if (typeof initialVolume === "number") {
      params.set("initial_volume", String(initialVolume));
    }
    if (name.trim()) params.set("name", name.trim());

    navigate(`/?${params.toString()}`);
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-[#e4e8ef]">
        <div className="rounded-2xl border border-[#d4a54f33] bg-[#161616] px-5 py-4">
          A validar a tua sessao...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(212,165,79,0.16)_0%,rgba(26,26,26,1)_48%,rgba(10,10,10,1)_100%)] px-4 py-10 text-[#e4e8ef]">
        <div className="mx-auto max-w-xl rounded-[28px] border border-[#d4a54f33] bg-[#121212f2] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d4a54f]">
            Plano de Corrida LHT
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[#f4f6fa]">
            Falta entrares com Google para guardar o teu plano.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#c9ced9]">
            O teu progresso e os dados da etapa anterior ficam associados a tua conta,
            para que o plano seja guardado e possamos continuar o fluxo sem perder informacao.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => signInWithGoogle("/formulario")}
              className="rounded-xl bg-[#d4a54f] px-5 py-3 text-sm font-semibold text-[#111111] hover:bg-[#c29740]"
            >
              Entrar com Google
            </button>
            <Link
              to="/"
              className="rounded-xl border border-[#d4a54f55] px-5 py-3 text-sm font-semibold text-[#f4f6fa] hover:bg-[#232323]"
            >
              Voltar ao inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(212,165,79,0.16)_0%,rgba(26,26,26,1)_48%,rgba(10,10,10,1)_100%)] py-10 px-4 text-[#e4e8ef]">
      <div className="max-w-3xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[#d4a54f] text-xs font-semibold uppercase tracking-[0.18em] mb-1">
              Lion Hybrid Training
            </p>
            <h1 className="text-3xl font-bold text-[#f4f6fa]">Plano de Corrida LHT</h1>
            <p className="text-[#c9ced9] mt-1">
              Estrutura, consistencia e progressao com proposito.
            </p>
          </div>
          <Link to="/" className="text-sm font-semibold text-[#d4a54f] hover:text-[#e6bc70]">
            Voltar ao inicio
          </Link>
        </div>

        {syncingLanding ? (
          <div className="mb-4 rounded-lg border border-[#2f855a66] bg-[#112017] px-3 py-2 text-xs text-[#8fe3b8]">
            A sincronizar os teus dados iniciais antes de gerar o plano.
          </div>
        ) : null}

        {/* ── Social proof ── */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl border border-[#d4a54f33] bg-[#141414cc] p-3">
            <p className="text-[#d4a54f] font-semibold">+120 atletas</p>
            <p className="text-[#c9ced9]">ja iniciaram o metodo LHT</p>
          </div>
          <div className="rounded-xl border border-[#d4a54f33] bg-[#141414cc] p-3">
            <p className="text-[#d4a54f] font-semibold">Metodo aplicado</p>
            <p className="text-[#c9ced9]">fisiologia, progressao e consistencia</p>
          </div>
          <div className="rounded-xl border border-[#d4a54f33] bg-[#141414cc] p-3">
            <p className="text-[#d4a54f] font-semibold">Comunidade ativa</p>
            <a
              href={COMMUNITY_URL}
              target="_blank"
              rel="noopener"
              className="text-[#c9ced9] hover:text-[#f4f6fa]"
            >
              suporte e accountability no WhatsApp
            </a>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleNext();
          }}
          className="bg-[#1f1f1ff2] rounded-2xl border border-[#d4a54f33] p-6 shadow-[0_0_30px_rgba(0,0,0,0.35)] space-y-8"
        >
          {/* Step Indicator */}
          <StepIndicator
            currentStep={currentStep}
            totalSteps={TOTAL_STEPS}
            stepLabels={[
              "Objetivo",
              "Nível Atual",
              "Progressão",
              "Duração",
              "Últimos Detalhes",
            ]}
          />

          {/* ════════════════════════════════════════════════════════════════
              STEP 1 — Objetivo
          ════════════════════════════════════════════════════════════════ */}
          {currentStep === 1 && (
            <section className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-[#f4f6fa]">
                1. Qual é o teu objetivo?
              </h2>
              <p className="text-sm text-[#c9ced9]">
                A corrida é sobre definir objetivos e alcancá-los.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-[#d9dde6]">Distancia objetivo</p>
              <ButtonGroup
                options={PROGRAM_DISTANCES}
                value={programDistance}
                onChange={setProgramDistance}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-[#d9dde6]">
                Quantas vezes por semana te comprometes a treinar?
              </p>
              <p className="text-xs text-[#8a94a8]">
                Uma maior frequencia permite uma evolucao mais rapida e segura.
              </p>
              <ButtonGroup
                options={TRAINING_FREQS}
                value={trainingFrequency}
                onChange={setTrainingFrequency}
              />
            </div>
            </section>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 2 — Nível Atual / VDOT
          ════════════════════════════════════════════════════════════════ */}
          {currentStep === 2 && (
            <section className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-[#f4f6fa]">
                2. Qual é o teu nivel atual?
              </h2>
              <p className="text-sm text-[#c9ced9]">
                Usamos isto para calcular os teus ritmos de treino individualizados (VDOT).
              </p>
            </div>

            {/* Seletor de caminho */}
            <div className="space-y-2">
              {(
                [
                  {
                    key: "race" as VdotPath,
                    emoji: "✅",
                    label:
                      "Tenho uma prova recente (tempo e distancia) ou ja sei estimar.",
                  },
                  {
                    key: "pace" as VdotPath,
                    emoji: "🎯",
                    label: "Prefiro usar os meus paces (easy ou threshold).",
                  },
                  {
                    key: "level" as VdotPath,
                    emoji: "❌",
                    label: "Nao tenho dados → escolho um nivel pre-definido.",
                  },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.key}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    vdotPath === opt.key
                      ? "border-[#d4a54f] bg-[#252015]"
                      : "border-[#d4a54f33] bg-[#1a1a1a] hover:border-[#d4a54f66]"
                  }`}
                >
                  <input
                    type="radio"
                    name="vdotPath"
                    className="mt-0.5 accent-[#d4a54f]"
                    checked={vdotPath === opt.key}
                    onChange={() => setVdotPath(opt.key)}
                  />
                  <span className="text-sm text-[#d9dde6]">
                    {opt.emoji} {opt.label}
                  </span>
                </label>
              ))}
            </div>

            {/* Path A — Prova */}
            {vdotPath === "race" && (
              <div className="space-y-4 pl-1">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-[#d9dde6]">Distancia da prova</p>
                  <ButtonGroup
                    options={RACE_DIST_OPTIONS}
                    value={raceDist}
                    onChange={setRaceDist}
                  />
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-[#d9dde6]">
                    Tempo da prova (HH:MM:SS)
                  </span>
                  <span className="text-xs text-[#8a94a8]">
                    Prova mais recente ou com melhor score dos ultimos 2/3 meses.
                  </span>
                  <input
                    className="border border-[#d4a54f44] bg-[#2a2a2a] rounded-md px-3 py-2 text-[#f4f6fa] w-40"
                    value={raceTimeStr}
                    onChange={(e) => setRaceTimeStr(e.target.value)}
                    placeholder="00:25:30"
                  />
                </label>
              </div>
            )}

            {/* Path B — Pace */}
            {vdotPath === "pace" && (
              <div className="space-y-4 pl-1">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-[#d9dde6]">Tipo de pace</p>
                  <div className="flex gap-4">
                    {(["easy", "threshold"] as PaceType[]).map((pt) => (
                      <label
                        key={pt}
                        className="inline-flex items-center gap-2 text-sm text-[#d9dde6] cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="paceType"
                          className="accent-[#d4a54f]"
                          checked={paceType === pt}
                          onChange={() => setPaceType(pt)}
                        />
                        {pt === "easy" ? "Easy (confortavel)" : "Threshold (limiar)"}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-[#d9dde6]">
                    Pace (MM:SS /km)
                  </span>
                  <input
                    className="border border-[#d4a54f44] bg-[#2a2a2a] rounded-md px-3 py-2 text-[#f4f6fa] w-32"
                    value={paceStr}
                    onChange={(e) => setPaceStr(e.target.value)}
                    placeholder="05:30"
                  />
                </label>
              </div>
            )}

            {/* Path C — Patamares */}
            {vdotPath === "level" && (
              <div className="space-y-2 pl-1">
                <p className="text-sm text-[#c9ced9]">
                  Seleciona o perfil que melhor te descreve:
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {VDOT_TIERS.map((tier) => (
                    <button
                      key={tier.vdot}
                      type="button"
                      onClick={() => setSelectedTier(tier.vdot)}
                      className={`text-left p-3 rounded-lg border transition-all ${
                        selectedTier === tier.vdot
                          ? "border-[#d4a54f] bg-[#252015]"
                          : "border-[#d4a54f33] bg-[#1a1a1a] hover:border-[#d4a54f66]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#d4a54f] uppercase tracking-wide">
                          {tier.level} · VDOT {tier.vdot}
                        </span>
                        <span className="text-xs text-[#8a94a8]">
                          Easy ~{tier.easyPace}/km
                        </span>
                      </div>
                      <p className="text-sm text-[#c9ced9] mt-0.5">
                        {tier.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Badge nivel estimado */}
            {estimatedLevel && estimatedVdot && estimatedPaces && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-[#18250f] border border-[#4a7a2a]">
                <span className="text-[#8fd45f] text-lg leading-none mt-0.5">✓</span>
                <div>
                  <p className="text-sm font-semibold text-[#8fd45f]">
                    Nivel estimado: {LEVEL_LABELS[estimatedLevel]}
                  </p>
                  <p className="text-xs text-[#92b870] mt-0.5">
                    VDOT ≈ {estimatedVdot.toFixed(1)} · Threshold ~{estimatedPaces.threshold}/km · Easy ~{estimatedPaces.easy}/km
                  </p>
                </div>
              </div>
            )}
            </section>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 3 — Progressão
          ════════════════════════════════════════════════════════════════ */}
          {currentStep === 3 && estimatedLevel && currentProgressionOptions && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[#f4f6fa]">
                  3. Com que intensidade queres progredir?
                </h2>
                <p className="text-sm text-[#c9ced9]">
                  O volume semanal tem de aumentar gradualmente. Iniciantes com boa
                  aptidao fisica podem progredir mais rapido; atletas experientes devem
                  ser mais conservadores.
                </p>
              </div>
              <ButtonGroup
                options={currentProgressionOptions}
                value={progressionRate}
                onChange={setProgressionRate}
              />
            </section>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 4 — Duração
          ════════════════════════════════════════════════════════════════ */}
          {currentStep === 4 && (
            <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-[#f4f6fa]">
                4. Em quanto tempo tens para atingir o teu objetivo?
              </h2>
              <p className="text-sm text-[#c9ced9]">
                Quanto maior a duracao, mais consistentes serao os resultados.
              </p>
            </div>
            <ButtonGroup
              options={PHASE_DURATIONS}
              value={phaseDuration}
              onChange={setPhaseDuration}
            />
          </section>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 5 — Últimos Detalhes
          ════════════════════════════════════════════════════════════════ */}
          {currentStep === 5 && (
            <section className="space-y-4">
            <h2 className="text-lg font-semibold text-[#f4f6fa]">
              5. Ultimos detalhes
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-[#d9dde6]">
                  Nome (opcional)
                </span>
                <input
                  className="border border-[#d4a54f44] bg-[#2a2a2a] rounded-md px-3 py-2 text-[#f4f6fa]"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Joao"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-[#d9dde6]">
                  Volume semanal atual km (opcional)
                </span>
                <span className="text-xs text-[#8a94a8]">
                  O volume com que ja dominas e consegues fazer sem acumular fadiga.
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  className="border border-[#d4a54f44] bg-[#2a2a2a] rounded-md px-3 py-2 text-[#f4f6fa]"
                  value={initialVolume}
                  onChange={(e) =>
                    setInitialVolume(e.target.value ? Number(e.target.value) : "")
                  }
                  placeholder="Ex.: 28"
                />
              </label>
            </div>

            <label className="inline-flex items-start gap-2 text-sm text-[#d9dde6] cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-[#d4a54f]"
                checked={weeklyCommitment}
                onChange={(e) => setWeeklyCommitment(e.target.checked)}
              />
              <span>
                Comprometo-me com consistencia minima de{" "}
                <strong className="text-[#f4f6fa]">
                  {trainingFrequency} treinos por semana
                </strong>.
              </span>
            </label>
            </section>
          )}

          {/* Error */}
          {errorMessage ? (
            <p className="text-sm text-[#ffd4d4] bg-[#3a1a1a] border border-[#8a3c3c] rounded-md px-3 py-2">
              {errorMessage}
            </p>
          ) : null}

          {/* Step Navigation */}
          <StepNavigation
            currentStep={currentStep}
            totalSteps={TOTAL_STEPS}
            canAdvance={canAdvance}
            onPrev={handlePrev}
            onNext={handleNext}
          />

          {/* Additional Links */}
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              to="/"
              className="px-5 py-2 rounded-md border border-[#d4a54f66] text-[#e4e8ef] text-sm font-semibold hover:bg-[#2a2a2a]"
            >
              Cancelar
            </Link>
            {currentStep === TOTAL_STEPS && (
              <a
                href={COMMUNITY_URL}
                target="_blank"
                rel="noopener"
                className="px-5 py-2 rounded-md border border-[#3a7c59] text-[#bde8d0] text-sm font-semibold hover:bg-[#143726]"
              >
                Entrar na Comunidade LHT
              </a>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function hydrateFormWithDraft(
  draft: PlanLandingDraft,
  actions: {
    setName: (value: string) => void;
    setProgramDistance: (value: number) => void;
    setTrainingFrequency: (value: number) => void;
  }
) {
  if (draft.name) {
    actions.setName(draft.name);
  }
  if (draft.goalDistance) {
    actions.setProgramDistance(draft.goalDistance);
  }
  if (draft.weeklyFrequency) {
    actions.setTrainingFrequency(draft.weeklyFrequency);
  }
}

function buildLandingPayload(draft: PlanLandingDraft) {
  return {
    name: draft.name,
    phone: draft.phone,
    goalDistance: draft.goalDistance,
    weeklyFrequency: draft.weeklyFrequency,
    experienceLevel: draft.experienceLevel,
    currentConsistency: draft.currentConsistency,
    savedAt: new Date().toISOString(),
  };
}

export default PlanForm;
