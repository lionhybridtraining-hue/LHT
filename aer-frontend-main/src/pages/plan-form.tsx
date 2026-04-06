import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ButtonGroup from "@/components/button-group";
import StepIndicator from "@/components/step-indicator";
import StepNavigation from "@/components/step-navigation";
import { fetchOnboardingIntake, mergeOnboardingAnswers } from "@/lib/onboarding-intake";
import {
  clearPlanLandingDraft,
  loadPlanLandingDraft,
  savePlanLandingDraft,
  normalizePhone,
  isValidPhone,
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
import {
  planocorridaPageStyle,
  planocorridaPanelStyle,
  planocorridaSoftPanelStyle,
} from "@/lib/planocorrida-theme";

const COMMUNITY_URL = "https://chat.whatsapp.com/JVsqO05fm4kLhbSaSiKL8n";

const FORM_SOCIAL_CARDS = [
  {
    title: "+120 atletas",
    body: "já iniciaram o método LHT",
    image: "/assets/img/DSC00702.jpg",
  },
  {
    title: "Método aplicado",
    body: "fisiologia, progressão e consistência",
    image: "/assets/img/TP_Coach.jpg",
  },
  {
    title: "Comunidade ativa",
    body: "suporte no WhatsApp",
    image: "/assets/img/DSC00791.jpg",
  },
];

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
  { label: "12 semanas", value: 4, sublabel: "3 fases de 4 sem" },
  { label: "15 semanas", value: 5, sublabel: "3 fases de 5 sem" },
  { label: "18 semanas", value: 6, sublabel: "3 fases de 6 sem" },
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
  const [phone, setPhone] = useState("");
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
      setPhone,
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
    // Keep fresher values already hydrated from landing/profile instead of overwriting with stale form drafts.
    setName((current) => (current.trim() ? current : formDraft.name));
    setPhone((current) => (current.trim() ? current : (formDraft.phone || "")));
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
          planocorrida_landing: buildLandingPayload(draft, { formCompleted: false }),
        });

        if (!isMounted) return;
        clearPlanLandingDraft();
      } catch (error) {
        console.warn("Não foi possível sincronizar a landing inicial:", error);
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

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;

    let isMounted = true;

    const hydrateFromIntake = async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        const intake = await fetchOnboardingIntake(accessToken);
        if (!isMounted || !intake) return;

        const prefillPhone = normalizePhone(intake.profile?.phone || "");
        const prefillName = (intake.profile?.fullName || "").trim();

        if (prefillPhone) {
          setPhone((current) => (current.trim() ? current : prefillPhone));
        }
        if (prefillName) {
          setName((current) => (current.trim() ? current : prefillName));
        }
      } catch (error) {
        console.warn("Não foi possível pré-preencher dados do perfil:", error);
      }
    };

    void hydrateFromIntake();

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

  // Preserve progression rate when level changes, unless it becomes invalid
  useEffect(() => {
    if (progressionRate !== null && currentProgressionOptions) {
      // Check if the selected progression rate is still valid for the new level
      const isStillValid = currentProgressionOptions.some(
        (opt) => opt.value === progressionRate
      );
      if (!isStillValid) {
        setProgressionRate(null);
      }
    }
  }, [estimatedLevel, currentProgressionOptions]);

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
      return "Seleciona o teu nível de experiência.";
    }
    if (estimatedVdot === null) {
      return "Não foi possível estimar o teu nível. Verifica os dados inseridos.";
    }
    return null;
  }

  /** Step 3: Progressão — Validate progression rate */
  function validateStep3(): string | null {
    if (progressionRate === null) {
      return "Seleciona o ritmo de progressão semanal.";
    }
    return null;
  }

  /** Step 4: Duração — Validate phase duration */
  function validateStep4(): string | null {
    if (!phaseDuration) {
      return "Seleciona a duração do plano.";
    }
    return null;
  }

  /** Step 5: Detalhes — Validate commitment */
  function validateStep5(): string | null {
    if (!isValidPhone(normalizePhone(phone))) {
      return "Indica um telemóvel válido para gerar o plano.";
    }
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
  }, [currentStep, programDistance, trainingFrequency, vdotPath, raceDist, raceTimeStr, paceType, paceStr, selectedTier, estimatedVdot, progressionRate, phaseDuration, phone, weeklyCommitment]);

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
      void handleSubmit(new Event("submit") as unknown as FormEvent<HTMLFormElement>);
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
      phone,
      weeklyCommitment,
      currentStep: step,
      createdAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    };
    savePlanFormDraft(draft);
  }

  function validateForm(): string | null {
    if (!programDistance || !trainingFrequency || !phaseDuration) {
      return "Preenche os campos de objetivo e duração.";
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
      return "Seleciona o teu nível de experiência.";
    }
    if (estimatedVdot === null) {
      return "Não foi possível estimar o teu nível. Verifica os dados inseridos.";
    }
    if (progressionRate === null) {
      return "Seleciona o ritmo de progressão semanal.";
    }
    if (!isValidPhone(normalizePhone(phone))) {
      return "Indica um telemóvel válido para gerar o plano.";
    }
    if (!weeklyCommitment) {
      return "Para continuar, confirma o teu compromisso semanal.";
    }
    return null;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const error = validateForm();
    if (error) {
      setErrorMessage(error);
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    const baseDraft = loadPlanLandingDraft();
    const landingDraft: PlanLandingDraft = {
      name: name.trim() || (baseDraft ? baseDraft.name : ""),
      phone: normalizedPhone,
      goalDistance: programDistance,
      weeklyFrequency: trainingFrequency,
      experienceLevel: (baseDraft && baseDraft.experienceLevel) || "building",
      currentConsistency: (baseDraft && baseDraft.currentConsistency) || "medium",
      createdAt: (baseDraft && baseDraft.createdAt) || new Date().toISOString(),
    };
    savePlanLandingDraft(landingDraft);

    try {
      const accessToken = await getAccessToken();
      if (accessToken) {
        await mergeOnboardingAnswers(accessToken, {
          planocorrida_landing: buildLandingPayload(landingDraft, { formCompleted: true }),
        });
      }
    } catch (syncError) {
      console.warn("Não foi possível sincronizar telemóvel antes de gerar plano:", syncError);
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
    navigate(`/atleta/plano?${params.toString()}`);
  }

  if (!authChecked) {
    return (
      <div className="relative min-h-screen px-4 text-[#e4e8ef]" style={planocorridaPageStyle}>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,7,0.46),rgba(7,7,7,0.82)),radial-gradient(circle_at_20%_0,rgba(212,165,79,0.14),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(22,102,216,0.16),transparent_30%)]" />
        <div className="relative flex min-h-screen items-center justify-center">
          <div
            className="rounded-[24px] border border-[#d4a54f29] px-5 py-4 shadow-[0_22px_54px_rgba(0,0,0,0.36)]"
            style={planocorridaPanelStyle}
          >
            A validar a tua sessão...
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative min-h-screen px-4 py-10 text-[#e4e8ef]" style={planocorridaPageStyle}>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,7,0.46),rgba(7,7,7,0.82)),radial-gradient(circle_at_20%_0,rgba(212,165,79,0.14),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(22,102,216,0.16),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(212,165,79,0.08),transparent_28%)]" />
        <div
          className="relative mx-auto max-w-xl rounded-[28px] border border-[#d4a54f29] p-7 shadow-[0_22px_54px_rgba(0,0,0,0.36)]"
          style={planocorridaPanelStyle}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d4a54f]">
            Plano de Corrida LHT
          </p>
          <h1 className="mt-2 font-['Oswald'] text-3xl font-semibold uppercase tracking-[0.03em] text-[#f4f6fa]">
            Falta entrares com Google para guardar o teu plano.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#c9ced9]">
            O teu progresso e os dados da etapa anterior ficam associados à tua conta,
            para que o plano seja guardado e possamos continuar o fluxo sem perder informação.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => signInWithGoogle("/atleta/onboarding/formulario")}
              className="rounded-xl bg-[#d4a54f] px-5 py-3 text-sm font-semibold text-[#111111] hover:bg-[#c29740]"
            >
              Entrar com Google
            </button>
            <Link
              to="/"
              className="rounded-xl border border-[#d4a54f55] px-5 py-3 text-sm font-semibold text-[#f4f6fa] hover:bg-[#232323]"
            >
              Voltar ao início
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-x-hidden py-8 px-3 text-[#e4e8ef] sm:px-4 sm:py-10" style={planocorridaPageStyle}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,7,0.46),rgba(7,7,7,0.82)),radial-gradient(circle_at_20%_0,rgba(212,165,79,0.14),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(22,102,216,0.16),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(212,165,79,0.08),transparent_28%)]" />
      <div className="relative max-w-4xl mx-auto">

        {/* ── Header ── */}
        <div
          className="mb-6 flex flex-col gap-4 rounded-[24px] border border-[#d4a54f29] p-4 shadow-[0_22px_54px_rgba(0,0,0,0.36)] sm:p-5 md:flex-row md:items-center md:justify-between"
          style={planocorridaPanelStyle}
        >
          <div className="flex items-start gap-3 sm:gap-4">
            <img
              src="/assets/img/logo-lht.png"
              alt="Lion Hybrid Training"
              className="h-[48px] w-auto sm:h-[56px]"
              loading="lazy"
            />
            <div>
            <p className="text-[#d4a54f] text-xs font-semibold uppercase tracking-[0.18em] mb-1">
              Lion Hybrid Training
            </p>
            <h1 className="font-['Oswald'] text-2xl font-semibold uppercase tracking-[0.03em] text-[#f4f6fa] sm:text-3xl">
              Plano de Corrida LHT
            </h1>
            <p className="text-[#c9ced9] mt-1 text-sm sm:text-base">
              Define o objetivo e gera o plano.
            </p>
            </div>
          </div>
          <Link
            to="/"
            className="inline-flex w-fit items-center rounded-full border border-[#d4a54f55] px-4 py-2 text-sm font-semibold text-[#f7f1e8] hover:bg-[rgba(255,255,255,0.05)]"
          >
            Voltar ao início
          </Link>
        </div>

        {syncingLanding ? (
          <div className="mb-4 rounded-lg border border-[#2f855a66] bg-[#112017] px-3 py-2 text-xs text-[#8fe3b8]">
            A sincronizar os teus dados iniciais.
          </div>
        ) : null}

        {/* ── Social proof ── */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          {FORM_SOCIAL_CARDS.map((card, index) => (
            <div
              key={card.title}
              className="rounded-[20px] border border-[#d4a54f29] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)]"
              style={{
                ...planocorridaSoftPanelStyle,
                backgroundImage: `linear-gradient(180deg, rgba(10,10,10,0.66), rgba(7,7,7,0.86)), url('${card.image}')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <p className="text-[#d4a54f] font-semibold">{card.title}</p>
              {index === 2 ? (
                <a
                  href={COMMUNITY_URL}
                  target="_blank"
                  rel="noopener"
                  className="text-[#e4e8ef] hover:text-[#f4f6fa]"
                >
                  {card.body}
                </a>
              ) : (
                <p className="text-[#e4e8ef]">{card.body}</p>
              )}
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleNext();
          }}
          className="rounded-[28px] border border-[#d4a54f29] p-4 shadow-[0_22px_54px_rgba(0,0,0,0.36)] space-y-8 sm:p-6"
          style={planocorridaPanelStyle}
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
                A corrida é sobre definir objetivos e alcançá-los.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-[#d9dde6]">Distância objetivo</p>
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
                Uma maior frequência permite uma evolução mais rápida e segura.
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
                2. Qual é o teu nível atual?
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
                      "Tenho uma prova recente (tempo e distância) ou já sei estimar.",
                  },
                  {
                    key: "pace" as VdotPath,
                    emoji: "🎯",
                    label: "Prefiro usar os meus paces (easy ou threshold).",
                  },
                  {
                    key: "level" as VdotPath,
                    emoji: "❌",
                    label: "Não tenho dados → escolho um nível pré-definido.",
                  },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.key}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    vdotPath === opt.key
                      ? "border-[#d4a54f] bg-[linear-gradient(180deg,rgba(46,34,13,0.96),rgba(24,18,8,0.96))]"
                      : "border-[#d4a54f29] bg-[linear-gradient(180deg,rgba(24,24,24,0.92),rgba(10,10,10,0.97))] hover:border-[#d4a54f66]"
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
                  <p className="text-sm font-medium text-[#d9dde6]">Distância da prova</p>
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
                    Prova mais recente ou com melhor score dos últimos 2/3 meses.
                  </span>
                  <input
                    className="border border-[#d4a54f44] bg-[rgba(255,255,255,0.04)] rounded-md px-3 py-2 text-[#f4f6fa] w-40"
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
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
                        {pt === "easy" ? "Easy (confortável)" : "Threshold (limiar)"}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-[#d9dde6]">
                    Pace (MM:SS /km)
                  </span>
                  <input
                    className="border border-[#d4a54f44] bg-[rgba(255,255,255,0.04)] rounded-md px-3 py-2 text-[#f4f6fa] w-32"
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
                          ? "border-[#d4a54f] bg-[linear-gradient(180deg,rgba(46,34,13,0.96),rgba(24,18,8,0.96))]"
                          : "border-[#d4a54f29] bg-[linear-gradient(180deg,rgba(24,24,24,0.92),rgba(10,10,10,0.97))] hover:border-[#d4a54f66]"
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
                    Nível estimado: {LEVEL_LABELS[estimatedLevel]}
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
                  aptidão física podem progredir mais rápido; atletas experientes devem
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
                Quanto maior a duração, mais consistentes serão os resultados.
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
              5. Últimos Detalhes
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-[#d9dde6]">
                  Telemóvel
                </span>
                <input
                  className="border border-[#d4a54f44] bg-[rgba(255,255,255,0.04)] rounded-md px-3 py-2 text-[#f4f6fa]"
                  value={phone}
                  onChange={(e) => setPhone(normalizePhone(e.target.value))}
                  placeholder="Ex.: +351 912 345 678"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-[#d9dde6]">
                  Volume semanal atual km (opcional)
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  className="border border-[#d4a54f44] bg-[rgba(255,255,255,0.04)] rounded-md px-3 py-2 text-[#f4f6fa]"
                  value={initialVolume}
                  onChange={(e) =>
                    setInitialVolume(e.target.value ? Number(e.target.value) : "")
                  }
                  placeholder="Ex.: 28"
                />
                <span className="text-xs text-[#8a94a8]">
                  O volume com que já dominas e consegues fazer sem acumular fadiga.
                </span>
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
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap">
            <Link
              to="/"
              className="w-full sm:w-auto px-5 py-2 rounded-md border border-[#d4a54f66] text-[#e4e8ef] text-sm font-semibold text-center hover:bg-[#2a2a2a]"
            >
              Cancelar
            </Link>
            {currentStep === TOTAL_STEPS && (
              <a
                href={COMMUNITY_URL}
                target="_blank"
                rel="noopener"
                className="w-full sm:w-auto px-5 py-2 rounded-md border border-[#3a7c59] text-[#bde8d0] text-sm font-semibold text-center hover:bg-[#143726]"
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
    setPhone: (value: string) => void;
    setProgramDistance: (value: number) => void;
    setTrainingFrequency: (value: number) => void;
  }
) {
  if (draft.name) {
    actions.setName(draft.name);
  }
  if (draft.phone) {
    actions.setPhone(draft.phone);
  }
  if (draft.goalDistance) {
    actions.setProgramDistance(draft.goalDistance);
  }
  if (draft.weeklyFrequency) {
    actions.setTrainingFrequency(draft.weeklyFrequency);
  }
}

function buildLandingPayload(draft: PlanLandingDraft, options?: { formCompleted?: boolean }) {
  return {
    name: draft.name,
    phone: draft.phone,
    goalDistance: draft.goalDistance,
    weeklyFrequency: draft.weeklyFrequency,
    experienceLevel: draft.experienceLevel,
    currentConsistency: draft.currentConsistency,
    formCompleted: Boolean(options && options.formCompleted),
    completedAt: options && options.formCompleted ? new Date().toISOString() : null,
    savedAt: new Date().toISOString(),
  };
}

export default PlanForm;
