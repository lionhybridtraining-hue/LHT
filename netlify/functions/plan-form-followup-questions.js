const MODEL = process.env.PLAN_FORM_AI_MODEL || "gemini-2.5-flash";

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

function normalizeAnswers(rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== "object") {
    return null;
  }

  return {
    name: String(rawAnswers.name || ""),
    programDistance: Number(rawAnswers.programDistance || 0),
    phaseDuration: Number(rawAnswers.phaseDuration || 0),
    trainingFrequency: Number(rawAnswers.trainingFrequency || 0),
    initialVolume:
      typeof rawAnswers.initialVolume === "number"
        ? rawAnswers.initialVolume
        : Number(rawAnswers.initialVolume || NaN),
    raceDistance:
      typeof rawAnswers.raceDistance === "number"
        ? rawAnswers.raceDistance
        : Number(rawAnswers.raceDistance || NaN),
    raceTimeSeconds:
      typeof rawAnswers.raceTimeSeconds === "number"
        ? rawAnswers.raceTimeSeconds
        : Number(rawAnswers.raceTimeSeconds || NaN),
    experienceLevel: String(rawAnswers.experienceLevel || "beginner"),
    injuriesLastMonths: Boolean(rawAnswers.injuriesLastMonths),
    maxAvailableMinutes:
      typeof rawAnswers.maxAvailableMinutes === "number"
        ? rawAnswers.maxAvailableMinutes
        : Number(rawAnswers.maxAvailableMinutes || NaN),
  };
}

function buildLocalQuestions(answers) {
  const questions = [];

  if (answers.injuriesLastMonths) {
    questions.push({
      id: "injury_context",
      label: "Quais foram as lesoes/dor recentes e em que fase estao?",
      placeholder: "Ex.: dor no Aquiles direito ha 6 semanas, em melhoria.",
      required: true,
    });
  }

  if (
    Number.isFinite(answers.initialVolume) &&
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

function sanitizeAiQuestions(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      id: String(item.id || `ai_question_${index + 1}`)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_"),
      label: String(item.label || "").trim(),
      placeholder: String(item.placeholder || "").trim(),
      required: Boolean(item.required),
    }))
    .filter((item) => item.label);
}

async function getAiQuestions(answers) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const system = [
    "Tu es um especialista em corrida de resistencia.",
    "Representas o metodo LHT (Lion Hybrid Training).",
    "Responde em Portugues europeu.",
    "Gera no maximo 4 perguntas de acompanhamento para personalizar um plano de treino.",
    "As perguntas devem ser objetivas e acionaveis.",
    "Mantem o foco nos principios: consistencia acima de perfeicao, progressao sustentavel, equilibrio forca/endurance e prevencao de lesao.",
    "Inclui sempre pelo menos uma pergunta sobre rotina, adesao semanal ou compromisso comportamental.",
    "Nao repitas perguntas sobre lesao se injuriesLastMonths for false.",
    "Devolve apenas JSON valido com formato:",
    '{"questions":[{"id":"string","label":"string","placeholder":"string","required":true}]}'
  ].join("\n");

  const prompt = `${system}\n\nDados do atleta: ${JSON.stringify(answers)}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const part =
    payload &&
    payload.candidates &&
    payload.candidates[0] &&
    payload.candidates[0].content &&
    Array.isArray(payload.candidates[0].content.parts)
      ? payload.candidates[0].content.parts.find((p) => typeof p.text === "string")
      : null;

  if (!part || !part.text) {
    return [];
  }

  try {
    const parsed = JSON.parse(part.text);
    return sanitizeAiQuestions(parsed.questions);
  } catch (_error) {
    return [];
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return json(400, { error: "Invalid JSON body" });
  }

  const answers = normalizeAnswers(body.answers);
  if (!answers) {
    return json(400, { error: "Missing answers payload" });
  }

  const localQuestions = buildLocalQuestions(answers);
  const aiQuestions = await getAiQuestions(answers);

  const deduped = new Map();
  for (const question of [...localQuestions, ...aiQuestions]) {
    if (!question.id || !question.label) continue;
    if (!deduped.has(question.id)) {
      deduped.set(question.id, question);
    }
  }

  return json(200, {
    questions: Array.from(deduped.values()),
    source: aiQuestions.length > 0 ? "ai+rules" : "rules",
  });
};
