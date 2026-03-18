export type IntakeAnswers = {
  name: string;
  programDistance: number;
  phaseDuration: number;
  trainingFrequency: number;
  initialVolume?: number;
  raceDistance?: number;
  raceTimeSeconds?: number;
  experienceLevel: "beginner" | "intermediate" | "advanced";
  injuriesLastMonths?: boolean;
  maxAvailableMinutes?: number;
};

export type FollowUpQuestion = {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
};

type AiFollowUpResponse = {
  questions?: FollowUpQuestion[];
};

function buildLocalQuestions(answers: IntakeAnswers): FollowUpQuestion[] {
  const questions: FollowUpQuestion[] = [];

  if (answers.injuriesLastMonths) {
    questions.push({
      id: "injury_context",
      label: "Quais foram as lesoes/dor recentes e em que fase estao?",
      placeholder: "Ex.: dor no Aquiles direito ha 6 semanas, em melhoria.",
      required: true,
    });
  }

  if (
    typeof answers.initialVolume === "number" &&
    answers.initialVolume > 0 &&
    answers.programDistance >= 21.1 &&
    answers.initialVolume < 30
  ) {
    questions.push({
      id: "long_run_history",
      label: "Qual foi o teu treino longo mais recente (distancia e como te sentiste)?",
      placeholder: "Ex.: 14km, ritmo controlado, terminou com fadiga moderada.",
      required: true,
    });
  }

  if (answers.trainingFrequency <= 2) {
    questions.push({
      id: "schedule_constraints",
      label: "Que dias/horarios tens mais restricoes para treinar?",
      placeholder: "Ex.: 3a e 5a so consigo 40 minutos ao final do dia.",
      required: true,
    });
  }

  if (answers.experienceLevel === "beginner") {
    questions.push({
      id: "consistency_goal",
      label: "Qual o principal obstaculo para manter consistencia semanal?",
      placeholder: "Ex.: falta de rotina, dificuldade em gerir cansaco.",
      required: true,
    });
  }

  return questions;
}

export default async function getFollowUpQuestions(
  answers: IntakeAnswers,
  shouldUseAi: boolean
): Promise<FollowUpQuestion[]> {
  const localQuestions = buildLocalQuestions(answers);

  if (!shouldUseAi) {
    return localQuestions;
  }

  const endpoint = import.meta.env.VITE_PLAN_FORM_AI_ENDPOINT;
  if (!endpoint) {
    return localQuestions;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ answers }),
    });

    if (!response.ok) {
      return localQuestions;
    }

    const payload: AiFollowUpResponse = await response.json();
    if (!payload || !Array.isArray(payload.questions)) {
      return localQuestions;
    }

    // Keep local safety-net questions and append AI suggestions that do not duplicate ids.
    const byId = new Map<string, FollowUpQuestion>();
    for (const question of [...localQuestions, ...payload.questions]) {
      if (!question || !question.id || !question.label) {
        continue;
      }
      if (!byId.has(question.id)) {
        byId.set(question.id, question);
      }
    }

    return Array.from(byId.values());
  } catch (_error) {
    return localQuestions;
  }
}
