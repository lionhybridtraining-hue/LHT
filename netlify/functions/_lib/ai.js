const DEFAULT_MODEL = "gemini-1.5-flash";

function safeJsonParse(content) {
  try {
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

function fallbackQuestions(summary) {
  return {
    summary,
    questions: [
      "A tua percepcao de esforco desta semana bate com os picos de carga que vemos nos dados?",
      "Houve algum fator fora do treino (sono, trabalho, stress, nutricao) que tenha afetado a tua execucao?",
      "Sentiste necessidade de reduzir intensidade ou volume em algum dia? Em que sessao e por que razao?",
      "Como classificas a tua recuperacao geral (1-10) e quais os sinais que observaste no corpo?"
    ]
  };
}

async function generateWeeklyQuestions({ apiKey, athlete, sessions, weekStart, weekEnd }) {
  const basicSummary = `Semana ${weekStart} a ${weekEnd}: ${sessions.length} sessoes.`;
  if (!apiKey) return fallbackQuestions(basicSummary);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`;
  const prompt = [
    "Tu es um treinador de endurance + forca.",
    "Responde em Portugues europeu.",
    "Gera uma analise curta da semana e 4 perguntas estrategicas para o atleta.",
    "As perguntas devem confrontar percepcao subjetiva com dados objetivos.",
    "Devolve apenas JSON valido com formato: {\"summary\": string, \"questions\": string[]}",
    `Atleta: ${athlete ? athlete.name || athlete.email || athlete.id : "desconhecido"}`,
    `Semana: ${weekStart} ate ${weekEnd}`,
    `Dados: ${JSON.stringify(sessions)}`
  ].join("\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    return fallbackQuestions(basicSummary);
  }

  const payload = await response.json();
  const content = payload && payload.candidates && payload.candidates[0] && payload.candidates[0].content
    ? payload.candidates[0].content
    : null;

  const textPart = content && Array.isArray(content.parts) ? content.parts.find((p) => typeof p.text === "string") : null;
  const parsed = safeJsonParse(textPart ? textPart.text : "");
  if (!parsed || !Array.isArray(parsed.questions)) {
    return fallbackQuestions(basicSummary);
  }

  return {
    summary: parsed.summary || basicSummary,
    questions: parsed.questions.slice(0, 6)
  };
}

async function generateCoachDraft({ apiKey, athlete, checkin, answers }) {
  const fallback = {
    alignment: "Analise pendente - Gemini indisponivel.",
    adjustments: ["Rever volume da semana seguinte com base na resposta do atleta."],
    final_feedback: "Obrigado pelo teu check-in. Vamos ajustar a proxima semana em funcao do teu feedback e dos dados recolhidos."
  };

  if (!apiKey) return fallback;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`;
  const prompt = [
    "Tu es um treinador de endurance + forca.",
    "Responde em Portugues europeu.",
    "Confronta os dados de treino da semana com as respostas do atleta.",
    "Devolve apenas JSON valido com formato:",
    "{\"alignment\": string, \"adjustments\": string[], \"final_feedback\": string}",
    `Atleta: ${athlete ? athlete.name || athlete.email || athlete.id : "desconhecido"}`,
    `Resumo semana: ${checkin.training_summary || ""}`,
    `Perguntas feitas: ${JSON.stringify(checkin.ai_questions || [])}`,
    `Respostas do atleta: ${JSON.stringify(answers || {})}`
  ].join("\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) return fallback;

  const payload = await response.json();
  const content = payload && payload.candidates && payload.candidates[0] && payload.candidates[0].content
    ? payload.candidates[0].content
    : null;

  const textPart = content && Array.isArray(content.parts) ? content.parts.find((p) => typeof p.text === "string") : null;
  const parsed = safeJsonParse(textPart ? textPart.text : "");

  if (!parsed || typeof parsed.final_feedback !== "string") return fallback;

  return {
    alignment: parsed.alignment || "",
    adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [],
    final_feedback: parsed.final_feedback
  };
}

module.exports = {
  generateWeeklyQuestions,
  generateCoachDraft
};
