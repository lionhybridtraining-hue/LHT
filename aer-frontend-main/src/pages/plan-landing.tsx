import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchOnboardingIntake, mergeOnboardingAnswers } from "@/lib/onboarding-intake";
import {
  loadPlanLandingDraft,
  savePlanLandingDraft,
  type PlanLandingDraft,
} from "@/lib/planocorrida-draft";
import {
  planocorridaPageStyle,
  planocorridaPanelStyle,
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

export default function PlanLanding() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [entrySynced, setEntrySynced] = useState(false);
  const [prefillChecked, setPrefillChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("building");
  const [currentConsistency, setCurrentConsistency] = useState("medium");

  useEffect(() => {
    if (!sessionChecked || !isAuthenticated || entrySynced) return;

    let isMounted = true;

    const syncLandingEntry = async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        await mergeOnboardingAnswers(accessToken, {
          planocorrida_landing: {
            entryAt: new Date().toISOString(),
            source: "planocorrida_landing"
          },
        });
      } catch (error) {
        console.warn("Não foi possível registar entrada na landing:", error);
      } finally {
        if (isMounted) {
          setEntrySynced(true);
        }
      }
    };

    syncLandingEntry();

    return () => {
      isMounted = false;
    };
  }, [entrySynced, isAuthenticated, sessionChecked]);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setIsAuthenticated(Boolean(data.session?.user));
      setUserEmail(data.session?.user?.email ?? null);
      setSessionChecked(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setIsAuthenticated(Boolean(session?.user));
      setUserEmail(session?.user?.email ?? null);
      setSessionChecked(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
  };

  const handleEnterApp = async () => {
    setErrorMessage(null);
    try {
      if (isAuthenticated) {
        navigate("/atleta/plano");
        return;
      }
      await signInWithGoogle("/atleta/plano");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir a app neste momento."
      );
    }
  };

  const handleLogin = async () => {
    setErrorMessage(null);
    setLoginSubmitting(true);

    try {
      if (isAuthenticated) {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setErrorMessage("Não foi possível validar a tua sessão. Tenta novamente.");
          return;
        }

        const intake = await fetchOnboardingIntake(accessToken);
        if (hasFormLoginAccess(intake)) {
          navigate("/formulario");
          return;
        }

        setErrorMessage("Esta conta ainda não tem nome e respostas iniciais completas para abrir o formulário direto.");
        return;
      }

      await signInWithGoogle("/formulario");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar o login com Google."
      );
    } finally {
      setLoginSubmitting(false);
    }
  };

  useEffect(() => {
    const draft = loadPlanLandingDraft();
    if (!draft) return;

    setName(draft.name);
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
        console.warn("Não foi possível carregar os dados guardados da landing:", error);
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

    const draft: PlanLandingDraft = {
      name: normalizedName,
      phone: "",
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
        navigate("/atleta/onboarding/formulario");
        return;
      }

      await signInWithGoogle("/atleta/onboarding/formulario");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar o login com Google."
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden text-[#edf1f7]" style={planocorridaPageStyle}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,7,7,0.42),rgba(7,7,7,0.78)),radial-gradient(circle_at_20%_0,rgba(212,165,79,0.14),transparent_35%),radial-gradient(circle_at_80%_10,rgba(22,102,216,0.16),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(212,165,79,0.08),transparent_28%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-3 py-8 sm:px-4 sm:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <section>
          <img
            src="/assets/img/logo-lht.png"
            alt="Lion Hybrid Training"
            className="mb-4 h-[120px] w-auto sm:h-[138px]"
            loading="eager"
          />
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#d4a54f]">
            Lion Hybrid Training
          </p>
          <h1 className="mt-4 max-w-2xl font-['Oswald'] text-4xl font-semibold uppercase leading-[0.98] tracking-[0.03em] text-[#f7f1e8] sm:text-5xl md:text-6xl">
            Plano de Corrida Gratuito
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#c8cfda] md:text-lg">
            Começa hoje com intenção: cria um plano estruturado, treina com consistência e aproxima-te da tua melhor versão em cada semana.
          </p>
        </section>

        <section
          className="rounded-[30px] border border-[#d4a54f29] p-6 shadow-[0_22px_54px_rgba(0,0,0,0.36)] backdrop-blur-[2px] md:p-7"
          style={planocorridaPanelStyle}
        >
            <div className="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold text-[#f7f1e8]">Começa agora</p>
              <p className="text-xs text-[#98a3b6]">
                {sessionChecked && isAuthenticated
                  ? prefillChecked
                    ? "Sessão ativa. Se já tivermos os teus dados, pré-preenchemos automaticamente."
                    : "Sessão ativa. A carregar os teus dados guardados."
                  : "Guardamos e retomamos após o login."}
              </p>
              {sessionChecked && isAuthenticated && userEmail ? (
                <p className="mt-0.5 text-[11px] text-[#d4a54f]">{userEmail}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isAuthenticated ? (
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={loginSubmitting}
                  className="rounded-full border border-[#d4a54f55] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#d4a54f] transition-colors hover:bg-[rgba(212,165,79,0.08)]"
                >
                  {loginSubmitting ? "A abrir..." : "Fazer Login"}
                </button>
              ) : null}

              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-full border border-[#d4a54f33] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#d4a54f] hover:bg-[rgba(212,165,79,0.08)] transition-colors cursor-pointer"
                >
                  Terminar sessão
                </button>
              ) : null}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-1">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#dce3ef]">Nome</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: João"
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
                  : "Registar e Gerar Plano"}
            </button>

            <button
              type="button"
              onClick={handleEnterApp}
              className="w-full rounded-2xl border border-[#2f2f2f] bg-[#111111] px-5 py-3.5 text-sm font-semibold text-[#f4f6fa] transition hover:bg-[#1a1a1a]"
            >
              Aceder ao Plano na App
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
    formCompleted: false,
    savedAt: new Date().toISOString(),
  };
}

function hasFormLoginAccess(intake: Awaited<ReturnType<typeof fetchOnboardingIntake>>) {
  const answers = asRecord(intake.answers);
  const landing = asRecord(answers.planocorrida_landing);

  const name = firstNonEmptyString(
    intake.profile?.fullName,
    asString(landing.name),
    asString(answers.nome_completo),
    asString(answers.full_name),
    asString(answers.fullName)
  );

  const experienceLevel = firstNonEmptyString(
    intake.profile?.experienceLevel,
    asString(landing.experienceLevel),
    asString(answers.experience_level),
    asString(answers.experienceLevel)
  );

  const consistencyLevel = firstNonEmptyString(
    intake.profile?.consistencyLevel,
    asString(landing.currentConsistency),
    asString(answers.consistency_level),
    asString(answers.consistencyLevel)
  );

  return Boolean(name && experienceLevel && consistencyLevel);
}