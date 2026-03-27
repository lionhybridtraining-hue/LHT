import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchOnboardingIntake, mergeOnboardingAnswers } from "@/lib/onboarding-intake";
import {
  isValidPhone,
  loadPlanLandingDraft,
  normalizePhone,
  savePlanLandingDraft,
  type PlanLandingDraft,
} from "@/lib/planocorrida-draft";
import {
  planocorridaPageStyle,
  planocorridaPanelStyle,
  planocorridaSoftPanelStyle,
} from "@/lib/planocorrida-theme";
import { getAccessToken, signInWithGoogle, supabase } from "@/lib/supabase";

const DEFAULT_GOAL_DISTANCE = 10;
const DEFAULT_WEEKLY_FREQUENCY = 3;

const EXPERIENCE_OPTIONS = [
  {
    value: "starter",
    title: "Recomeçar",
    body: "Estrutura simples.",
  },
  {
    value: "building",
    title: "Evoluir",
    body: "Plano mais afinado.",
  },
  {
    value: "performance",
    title: "Performance",
    body: "Ritmos para competir.",
  },
];

const CONSISTENCY_OPTIONS = [
  {
    value: "low",
    title: "Voltar ao ritmo",
  },
  {
    value: "medium",
    title: "Treinar com estrutura",
  },
  {
    value: "high",
    title: "Otimizar",
  },
];

const LANDING_STEPS = [
  {
    id: "1",
    text: "Respondes rapido ao essencial.",
    image: "/assets/img/DSC00702.jpg",
  },
  {
    id: "2",
    text: "Fazes login sem perder nada.",
    image: "/assets/img/TP_Coach.jpg",
  },
  {
    id: "3",
    text: "Segues para gerar o plano final.",
    image: "/assets/img/DSC00791.jpg",
  },
];

export default function PlanLanding() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [prefillChecked, setPrefillChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("building");
  const [currentConsistency, setCurrentConsistency] = useState("medium");

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setIsAuthenticated(Boolean(data.session?.user));
      setSessionChecked(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setIsAuthenticated(Boolean(session?.user));
      setSessionChecked(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const draft = loadPlanLandingDraft();
    if (!draft) return;

    setName(draft.name);
    setPhone(draft.phone);
    setExperienceLevel(draft.experienceLevel || "building");
    setCurrentConsistency(draft.currentConsistency || "medium");
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!sessionChecked) return;

    if (!isAuthenticated) {
      setPrefillChecked(true);
      return;
    }

    const hydrateExistingIntake = async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        const intake = await fetchOnboardingIntake(accessToken);
        if (!isMounted) return;

        const prefill = extractLandingPrefill(intake);

        if (prefill.name) {
          setName((current) => (current.trim() ? current : prefill.name || ""));
        }

        if (prefill.phone) {
          setPhone((current) => {
            if (isValidPhone(current)) return current;
            return prefill.phone || current;
          });
        }

        if (intake.profile?.experienceLevel) {
          setExperienceLevel((current) =>
            current === "building" ? intake.profile?.experienceLevel || current : current
          );
        }

        if (intake.profile?.consistencyLevel) {
          setCurrentConsistency((current) =>
            current === "medium" ? intake.profile?.consistencyLevel || current : current
          );
        }
      } catch (error) {
        console.warn("Nao foi possivel carregar os dados guardados da landing:", error);
      } finally {
        if (isMounted) {
          setPrefillChecked(true);
        }
      }
    };

    hydrateExistingIntake();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, sessionChecked]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const normalizedName = name.trim();
    const normalizedPhone = normalizePhone(phone);

    if (!isValidPhone(normalizedPhone)) {
      setErrorMessage("Introduz um numero de telemovel valido para continuar.");
      return;
    }

    const draft: PlanLandingDraft = {
      name: normalizedName,
      phone: normalizedPhone,
      goalDistance: DEFAULT_GOAL_DISTANCE,
      weeklyFrequency: DEFAULT_WEEKLY_FREQUENCY,
      experienceLevel,
      currentConsistency,
      createdAt: new Date().toISOString(),
    };

    savePlanLandingDraft(draft);
    setSubmitting(true);

    try {
      if (isAuthenticated) {
        const accessToken = await getAccessToken();
        if (accessToken) {
          await mergeOnboardingAnswers(accessToken, {
            planocorrida_landing: buildLandingPayload(draft),
          });
        }
        navigate("/formulario");
        return;
      }

      await signInWithGoogle("/formulario");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel iniciar o login com Google."
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-[#edf1f7]" style={planocorridaPageStyle}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,7,0.42),rgba(7,7,7,0.78)),radial-gradient(circle_at_20%_0,rgba(212,165,79,0.14),transparent_35%),radial-gradient(circle_at_80%_10,rgba(22,102,216,0.16),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(212,165,79,0.08),transparent_28%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1.05fr_0.95fr]">
        <section>
          <img
            src="/assets/img/logo-lht.png"
            alt="Lion Hybrid Training"
            className="mb-4 h-[72px] w-auto"
            loading="eager"
          />
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#d4a54f]">
            Lion Hybrid Training
          </p>
          <h1 className="mt-4 max-w-2xl font-['Oswald'] text-5xl font-semibold uppercase leading-[0.98] tracking-[0.03em] text-[#f7f1e8] md:text-6xl">
            Plano de corrida personalizado em poucos passos.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#c8cfda] md:text-lg">
            Responde, entra com Google e avanca para o teu plano.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {LANDING_STEPS.map((step) => (
              <div
                key={step.id}
                className="relative overflow-hidden rounded-2xl border border-[#d4a54f29] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.28)]"
                style={{
                  ...planocorridaSoftPanelStyle,
                  backgroundImage: `linear-gradient(180deg, rgba(10,10,10,0.66), rgba(7,7,7,0.86)), url('${step.image}')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <p className="text-2xl font-semibold text-[#f7f1e8]">{step.id}</p>
                <p className="mt-2 text-sm text-[#e4e8ef]">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="rounded-[30px] border border-[#d4a54f29] p-6 shadow-[0_22px_54px_rgba(0,0,0,0.36)] backdrop-blur-[2px] md:p-7"
          style={planocorridaPanelStyle}
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#f7f1e8]">Comeca agora</p>
              <p className="text-xs text-[#98a3b6]">
                {sessionChecked && isAuthenticated
                  ? prefillChecked
                    ? isValidPhone(phone)
                      ? "Sessao ativa. Os teus dados ja estao prontos para seguir."
                      : "Sessao ativa. Se ja tivermos os teus dados, pre-preenchemos automaticamente."
                    : "Sessao ativa. A carregar os teus dados guardados."
                  : "Guardamos e retomamos apos o login."}
              </p>
            </div>
            <div className="rounded-full border border-[#d4a54f33] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#d4a54f]">
              {isAuthenticated ? "login ativo" : "google login"}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#dce3ef]">Nome</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: Joao"
                  className="rounded-xl border border-[#d4a54f3d] bg-[rgba(255,255,255,0.04)] px-3 py-3 text-sm text-[#f7f1e8] outline-none transition focus:border-[#d4a54f]"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#dce3ef]">Telemovel</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(normalizePhone(event.target.value))}
                  placeholder="Ex.: +351 912 345 678"
                  className="rounded-xl border border-[#d4a54f3d] bg-[rgba(255,255,255,0.04)] px-3 py-3 text-sm text-[#f7f1e8] outline-none transition focus:border-[#d4a54f]"
                />
              </label>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-[#dce3ef]">Em que ponto estás?</p>
              <div className="grid gap-2">
                {EXPERIENCE_OPTIONS.map((option) => {
                  const active = option.value === experienceLevel;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setExperienceLevel(option.value)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        active
                          ? "border-[#d4a54f] bg-[linear-gradient(180deg,rgba(46,34,13,0.96),rgba(24,18,8,0.96))]"
                          : "border-[#d4a54f29] bg-[linear-gradient(180deg,rgba(24,24,24,0.92),rgba(10,10,10,0.97))] hover:border-[#d4a54f66]"
                      }`}
                    >
                      <p className="text-sm font-semibold text-[#f7f1e8]">{option.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#a9b2bf]">{option.body}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-[#dce3ef]">Como está a tua consistencia atual?</p>
              <div className="grid gap-2 md:grid-cols-3">
                {CONSISTENCY_OPTIONS.map((option) => {
                  const active = option.value === currentConsistency;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setCurrentConsistency(option.value)}
                      className={`rounded-2xl border px-3 py-3 text-sm transition ${
                        active
                          ? "border-[#d4a54f] bg-[linear-gradient(180deg,rgba(46,34,13,0.96),rgba(24,18,8,0.96))] text-[#f7f1e8]"
                          : "border-[#d4a54f29] bg-[linear-gradient(180deg,rgba(24,24,24,0.92),rgba(10,10,10,0.97))] text-[#c8cfda] hover:border-[#d4a54f66]"
                      }`}
                    >
                      {option.title}
                    </button>
                  );
                })}
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-xl border border-[#8a3c3c] bg-[#341818] px-3 py-2 text-sm text-[#ffd4d4]">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting || !sessionChecked || (isAuthenticated && !prefillChecked)}
              className="w-full rounded-2xl bg-[#d4a54f] px-5 py-3.5 text-sm font-semibold text-[#111111] transition hover:bg-[#c29740] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting
                ? "A abrir..."
                : isAuthenticated
                  ? "Ir para o formulario final"
                  : "Entrar com Google e gerar plano"}
            </button>

            <p className="text-center text-xs leading-5 text-[#8f99a8]">
              Guardamos para continuares sem perder nada.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}

function extractLandingPrefill(intake: Awaited<ReturnType<typeof fetchOnboardingIntake>>) {
  const answers = asRecord(intake.answers);
  const landing = asRecord(answers.planocorrida_landing);

  return {
    name: firstNonEmptyString(
      intake.profile?.fullName,
      asString(landing.name),
      asString(answers.nome_completo),
      asString(answers.full_name),
      asString(answers.fullName)
    ),
    phone: firstNonEmptyString(
      intake.profile?.phone,
      asString(landing.phone),
      asString(answers.telemovel),
      asString(answers.phone)
    ),
  };
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstNonEmptyString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }

  return "";
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