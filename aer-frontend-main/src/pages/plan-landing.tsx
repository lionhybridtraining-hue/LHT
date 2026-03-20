import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ButtonGroup from "@/components/button-group";
import { mergeOnboardingAnswers } from "@/lib/onboarding-intake";
import {
  isValidPhone,
  normalizePhone,
  savePlanLandingDraft,
  type PlanLandingDraft,
} from "@/lib/planocorrida-draft";
import { getAccessToken, signInWithGoogle, supabase } from "@/lib/supabase";

const GOAL_OPTIONS = [
  { label: "5K", value: 5 },
  { label: "10K", value: 10 },
  { label: "Meia", value: 21.1 },
  { label: "Maratona", value: 42.2 },
];

const FREQUENCY_OPTIONS = [
  { label: "2x / semana", value: 2 },
  { label: "3x / semana", value: 3 },
  { label: "4x / semana", value: 4 },
  { label: "5x / semana", value: 5 },
];

const EXPERIENCE_OPTIONS = [
  {
    value: "starter",
    title: "Estou a recomeçar",
    body: "Quero estrutura simples e progressiva para ganhar consistencia.",
  },
  {
    value: "building",
    title: "Ja corro com regularidade",
    body: "Procuro um plano mais afinado para evoluir com criterio.",
  },
  {
    value: "performance",
    title: "Quero performance",
    body: "Tenho base e quero atacar um objetivo especifico com ritmos certos.",
  },
];

const CONSISTENCY_OPTIONS = [
  {
    value: "low",
    title: "Preciso de voltar ao ritmo",
  },
  {
    value: "medium",
    title: "Ja treino, mas sem estrutura",
  },
  {
    value: "high",
    title: "Treino bem e quero otimizar",
  },
];

export default function PlanLanding() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [goalDistance, setGoalDistance] = useState(10);
  const [weeklyFrequency, setWeeklyFrequency] = useState(3);
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

  async function handleLoginClick() {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await signInWithGoogle("/");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel iniciar o login com Google."
      );
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!isValidPhone(phone)) {
      setErrorMessage("Introduz um numero de telemovel valido para continuar.");
      return;
    }

    const draft: PlanLandingDraft = {
      name: name.trim(),
      phone: normalizePhone(phone),
      goalDistance,
      weeklyFrequency,
      experienceLevel,
      currentConsistency,
      createdAt: new Date().toISOString(),
    };

    savePlanLandingDraft(draft);
    setSubmitting(true);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setErrorMessage("Sessao expirada. Recarrega a pagina e tenta novamente.");
        setSubmitting(false);
        return;
      }
      await mergeOnboardingAnswers(accessToken, {
        planocorrida_landing: buildLandingPayload(draft),
      });
      navigate("/formulario");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel guardar os dados."
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#090909_0%,#131313_40%,#0b0b0b_100%)] text-[#edf1f7]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(212,165,79,0.22),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(164,96,42,0.18),transparent_24%),radial-gradient(circle_at_55%_100%,rgba(212,165,79,0.12),transparent_30%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-[1.05fr_0.95fr]">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#d4a54f]">
            Lion Hybrid Training
          </p>
          <h1 className="mt-4 max-w-2xl font-serif text-5xl font-semibold leading-[0.98] text-[#f7f1e8] md:text-6xl">
            Cria o teu plano de corrida em tres passos simples.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#c8cfda] md:text-lg">
            Entra com Google logo no inicio, responde a algumas perguntas rapidas
            e segue direto para o formulario final com os teus dados ja associados a tua conta.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#d4a54f22] bg-[#151515] p-4">
              <p className="text-2xl font-semibold text-[#f7f1e8]">1</p>
              <p className="mt-2 text-sm text-[#c8cfda]">Fazes login com Google para comecar.</p>
            </div>
            <div className="rounded-2xl border border-[#d4a54f22] bg-[#151515] p-4">
              <p className="text-2xl font-semibold text-[#f7f1e8]">2</p>
              <p className="mt-2 text-sm text-[#c8cfda]">Respondes a algumas perguntas-chave.</p>
            </div>
            <div className="rounded-2xl border border-[#d4a54f22] bg-[#151515] p-4">
              <p className="text-2xl font-semibold text-[#f7f1e8]">3</p>
              <p className="mt-2 text-sm text-[#c8cfda]">Acabas o plano e guardamos os teus dados.</p>
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#d4a54f33] bg-[#111111e8] p-6 shadow-[0_35px_90px_rgba(0,0,0,0.5)] backdrop-blur-sm md:p-7">
          {!sessionChecked ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <p className="text-sm text-[#98a3b6]">A verificar sessao...</p>
            </div>
          ) : !isAuthenticated ? (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-[#f7f1e8]">Primeiro passo</p>
                <p className="mt-1 text-xs text-[#98a3b6]">
                  Entra com Google para comecar. Os teus dados ficam seguros e associados a tua conta.
                </p>
              </div>

              {errorMessage ? (
                <div className="rounded-xl border border-[#8a3c3c] bg-[#341818] px-3 py-2 text-sm text-[#ffd4d4]">
                  {errorMessage}
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleLoginClick}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#d4a54f] px-5 py-3.5 text-sm font-semibold text-[#111111] transition hover:bg-[#c29740] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? (
                  "A entrar..."
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5 shrink-0">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                      <path fill="none" d="M0 0h48v48H0z"/>
                    </svg>
                    Entrar com Google
                  </>
                )}
              </button>

              <p className="text-center text-xs leading-5 text-[#8f99a8]">
                Ao entrar, concordas em associar o teu plano de corrida a esta conta Google.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#f7f1e8]">Segundo passo</p>
                  <p className="text-xs text-[#98a3b6]">
                    Sessao ativa. Responde as perguntas e segue para o formulario final.
                  </p>
                </div>
                <div className="rounded-full border border-[#d4a54f33] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#d4a54f]">
                  login ativo
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
                      className="rounded-xl border border-[#d4a54f3d] bg-[#1a1a1a] px-3 py-3 text-sm text-[#f7f1e8] outline-none transition focus:border-[#d4a54f]"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-[#dce3ef]">Telemovel</span>
                    <input
                      value={phone}
                      onChange={(event) => setPhone(normalizePhone(event.target.value))}
                      placeholder="Ex.: +351 912 345 678"
                      className="rounded-xl border border-[#d4a54f3d] bg-[#1a1a1a] px-3 py-3 text-sm text-[#f7f1e8] outline-none transition focus:border-[#d4a54f]"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-[#dce3ef]">Qual o teu objetivo principal?</p>
                  <ButtonGroup options={GOAL_OPTIONS} value={goalDistance} onChange={setGoalDistance} />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-[#dce3ef]">Quantas vezes consegues treinar por semana?</p>
                  <ButtonGroup
                    options={FREQUENCY_OPTIONS}
                    value={weeklyFrequency}
                    onChange={setWeeklyFrequency}
                  />
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
                              ? "border-[#d4a54f] bg-[#241d12]"
                              : "border-[#d4a54f22] bg-[#161616] hover:border-[#d4a54f66]"
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
                              ? "border-[#d4a54f] bg-[#241d12] text-[#f7f1e8]"
                              : "border-[#d4a54f22] bg-[#161616] text-[#c8cfda] hover:border-[#d4a54f66]"
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
                  disabled={submitting}
                  className="w-full rounded-2xl bg-[#d4a54f] px-5 py-3.5 text-sm font-semibold text-[#111111] transition hover:bg-[#c29740] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "A continuar..." : "Continuar para o formulario final"}
                </button>

                <p className="text-center text-xs leading-5 text-[#8f99a8]">
                  Ao continuar, guardamos estas respostas para que o teu plano fique associado a tua conta.
                </p>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
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