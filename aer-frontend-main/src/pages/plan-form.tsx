import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import getFollowUpQuestions, {
  FollowUpQuestion,
  IntakeAnswers,
} from "@/services/plan-intake/get-follow-up-questions";

type ExtraAnswers = Record<string, string>;

function parseRaceTimeToSeconds(raceTime: string): number | undefined {
  const normalized = raceTime.trim();
  if (!normalized) return undefined;

  const hhmmss = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!hhmmss) return undefined;

  const hours = Number(hhmmss[1]);
  const minutes = Number(hhmmss[2]);
  const seconds = Number(hhmmss[3] || 0);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return undefined;
  }

  if (minutes > 59 || seconds > 59) return undefined;

  return hours * 3600 + minutes * 60 + seconds;
}

function PlanForm() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [programDistance, setProgramDistance] = useState(10);
  const [phaseDuration, setPhaseDuration] = useState(6);
  const [trainingFrequency, setTrainingFrequency] = useState(3);
  const [progressionRate, setProgressionRate] = useState(1.06);
  const [initialVolume, setInitialVolume] = useState<number | "">("");
  const [maxAvailableMinutes, setMaxAvailableMinutes] = useState<number | "">("");

  const [hasRaceGoal, setHasRaceGoal] = useState(false);
  const [raceDistance, setRaceDistance] = useState<number | "">("");
  const [raceTime, setRaceTime] = useState("");

  const [experienceLevel, setExperienceLevel] = useState<
    "beginner" | "intermediate" | "advanced"
  >("beginner");
  const [injuriesLastMonths, setInjuriesLastMonths] = useState(false);

  const [useAiFollowUps, setUseAiFollowUps] = useState(true);
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [extraAnswers, setExtraAnswers] = useState<ExtraAnswers>({});

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  const hasAiEndpoint = Boolean(import.meta.env.VITE_PLAN_FORM_AI_ENDPOINT);

  const intakeAnswers = useMemo<IntakeAnswers>(
    () => ({
      name,
      programDistance,
      phaseDuration,
      trainingFrequency,
      initialVolume: typeof initialVolume === "number" ? initialVolume : undefined,
      raceDistance: hasRaceGoal && typeof raceDistance === "number" ? raceDistance : undefined,
      raceTimeSeconds: hasRaceGoal ? parseRaceTimeToSeconds(raceTime) : undefined,
      experienceLevel,
      injuriesLastMonths,
      maxAvailableMinutes:
        typeof maxAvailableMinutes === "number" ? maxAvailableMinutes : undefined,
    }),
    [
      experienceLevel,
      hasRaceGoal,
      injuriesLastMonths,
      initialVolume,
      maxAvailableMinutes,
      name,
      phaseDuration,
      programDistance,
      raceDistance,
      raceTime,
      trainingFrequency,
    ]
  );

  async function handleGenerateQuestions() {
    setErrorMessage(null);
    setIsLoadingAi(true);

    const questions = await getFollowUpQuestions(intakeAnswers, useAiFollowUps);
    setFollowUpQuestions(questions);
    setIsLoadingAi(false);
  }

  function validateBaseForm(): string | null {
    if (!programDistance || !phaseDuration || !trainingFrequency || !progressionRate) {
      return "Preenche os campos obrigatorios para gerar o plano.";
    }

    if (hasRaceGoal && !raceDistance) {
      return "Indica a distancia da prova-alvo.";
    }

    if (hasRaceGoal && raceTime.trim() && !parseRaceTimeToSeconds(raceTime)) {
      return "Formato de tempo de prova invalido. Usa HH:MM ou HH:MM:SS.";
    }

    for (const question of followUpQuestions) {
      if (!question.required) continue;
      const answer = extraAnswers[question.id];
      if (!answer || !answer.trim()) {
        return "Responde a todas as perguntas de acompanhamento obrigatorias.";
      }
    }

    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const validationError = validateBaseForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const params = new URLSearchParams();
    params.set("progression_rate", String(progressionRate));
    params.set("phase_duration", String(phaseDuration));
    params.set("training_frequency", String(trainingFrequency));
    params.set("program_distance", String(programDistance));

    if (name.trim()) {
      params.set("name", name.trim());
    }

    if (typeof initialVolume === "number") {
      params.set("initial_volume", String(initialVolume));
    }

    if (hasRaceGoal && typeof raceDistance === "number") {
      params.set("race_dist", String(raceDistance));
      const raceTimeSeconds = parseRaceTimeToSeconds(raceTime);
      if (typeof raceTimeSeconds === "number") {
        params.set("race_time", String(raceTimeSeconds));
      }
    }

    // Keep extra answers in query so backend can evolve without breaking old contract.
    for (const [key, value] of Object.entries(extraAnswers)) {
      if (!value.trim()) continue;
      params.set(`intake_${key}`, value.trim());
    }

    navigate(`/?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Gerador de Plano de Corrida</h1>
            <p className="text-slate-600 mt-1">
              Preenche os dados abaixo para gerar um plano inicial personalizado.
            </p>
          </div>
          <Link
            to="/"
            className="text-sm font-semibold text-blue-700 hover:text-blue-800"
          >
            Voltar ao plano
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Perfil do atleta</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Nome</span>
                <input
                  className="border border-slate-300 rounded-md px-3 py-2"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: Joao"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Nivel de experiencia</span>
                <select
                  className="border border-slate-300 rounded-md px-3 py-2"
                  value={experienceLevel}
                  onChange={(event) =>
                    setExperienceLevel(
                      event.target.value as "beginner" | "intermediate" | "advanced"
                    )
                  }
                >
                  <option value="beginner">Iniciante</option>
                  <option value="intermediate">Intermedio</option>
                  <option value="advanced">Avancado</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Volume semanal atual (km)</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  className="border border-slate-300 rounded-md px-3 py-2"
                  value={initialVolume}
                  onChange={(event) =>
                    setInitialVolume(event.target.value ? Number(event.target.value) : "")
                  }
                  placeholder="Ex.: 28"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Tempo maximo por sessao (min)</span>
                <input
                  type="number"
                  min={20}
                  max={300}
                  step="5"
                  className="border border-slate-300 rounded-md px-3 py-2"
                  value={maxAvailableMinutes}
                  onChange={(event) =>
                    setMaxAvailableMinutes(
                      event.target.value ? Number(event.target.value) : ""
                    )
                  }
                  placeholder="Ex.: 75"
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={injuriesLastMonths}
                onChange={(event) => setInjuriesLastMonths(event.target.checked)}
              />
              Tive lesao/dor relevante nos ultimos 6 meses
            </label>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Plano pretendido</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Distancia objetivo (km)</span>
                <select
                  className="border border-slate-300 rounded-md px-3 py-2"
                  value={programDistance}
                  onChange={(event) => setProgramDistance(Number(event.target.value))}
                >
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                  <option value={21.1}>21.1 km</option>
                  <option value={42.2}>42.2 km</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Duracao por fase (semanas)</span>
                <input
                  type="number"
                  min={4}
                  max={12}
                  step={1}
                  className="border border-slate-300 rounded-md px-3 py-2"
                  value={phaseDuration}
                  onChange={(event) => setPhaseDuration(Number(event.target.value))}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Frequencia semanal (treinos)</span>
                <input
                  type="number"
                  min={2}
                  max={6}
                  step={1}
                  className="border border-slate-300 rounded-md px-3 py-2"
                  value={trainingFrequency}
                  onChange={(event) => setTrainingFrequency(Number(event.target.value))}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Progressao semanal</span>
                <input
                  type="number"
                  min={1.01}
                  max={1.2}
                  step="0.01"
                  className="border border-slate-300 rounded-md px-3 py-2"
                  value={progressionRate}
                  onChange={(event) => setProgressionRate(Number(event.target.value))}
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hasRaceGoal}
                onChange={(event) => setHasRaceGoal(event.target.checked)}
              />
              Tenho prova-alvo definida
            </label>

            {hasRaceGoal ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Distancia da prova (km)</span>
                  <input
                    type="number"
                    min={5}
                    step="0.1"
                    className="border border-slate-300 rounded-md px-3 py-2"
                    value={raceDistance}
                    onChange={(event) =>
                      setRaceDistance(event.target.value ? Number(event.target.value) : "")
                    }
                    placeholder="Ex.: 10"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Tempo alvo (HH:MM ou HH:MM:SS)</span>
                  <input
                    className="border border-slate-300 rounded-md px-3 py-2"
                    value={raceTime}
                    onChange={(event) => setRaceTime(event.target.value)}
                    placeholder="Ex.: 00:45:00"
                  />
                </label>
              </div>
            ) : null}
          </section>

          <section className="space-y-4 border border-slate-200 rounded-xl p-4 bg-slate-50">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold">Perguntas inteligentes</h2>
                <p className="text-sm text-slate-600">
                  Ativa perguntas de acompanhamento para melhorar a personalizacao do plano.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={useAiFollowUps}
                  onChange={(event) => setUseAiFollowUps(event.target.checked)}
                />
                Ativar modo inteligente
              </label>
            </div>

            {!hasAiEndpoint ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Endpoint AI ainda nao configurado. A app esta a usar regras locais como fallback.
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleGenerateQuestions}
              disabled={isLoadingAi}
              className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-70"
            >
              {isLoadingAi ? "A gerar perguntas..." : "Gerar perguntas de acompanhamento"}
            </button>

            {followUpQuestions.length > 0 ? (
              <div className="space-y-3">
                {followUpQuestions.map((question) => (
                  <label key={question.id} className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{question.label}</span>
                    <textarea
                      className="border border-slate-300 rounded-md px-3 py-2 min-h-20"
                      placeholder={question.placeholder || "Resposta"}
                      value={extraAnswers[question.id] || ""}
                      onChange={(event) =>
                        setExtraAnswers((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </section>

          {errorMessage ? (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex gap-3 flex-wrap">
            <button
              type="submit"
              className="px-5 py-3 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700"
            >
              Gerar plano
            </button>
            <Link
              to="/"
              className="px-5 py-3 rounded-md border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PlanForm;
