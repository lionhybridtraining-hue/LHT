const { getActiveAiPrompt, insertAiLog } = require("./supabase");

const DEFAULT_MODEL = "gemini-2.5-flash";
const WEEKLY_FEATURE = "weekly_questions";
const COACH_FEATURE = "coach_draft";

const WEEKLY_SYSTEM_FALLBACK = [
  "Tu es um treinador de endurance + forca.",
  "Responde em Portugues europeu.",
  "Gera uma analise curta da semana e 4 perguntas estrategicas para o atleta.",
  "As perguntas devem confrontar percepcao subjetiva com dados objetivos.",
  "ATENCAO: para treino de forca, NAO uses classificacao automatica done_not_planned do CSV.",
  "Para forca, usa apenas os contadores de confirmacao manual fornecidos pelo coach.",
  "Se houver confirmacao manual de forca, o resumo deve mencionar esses contadores.",
  "Se houver confirmacao manual de forca, inclui pelo menos uma pergunta especifica de forca.",
  "Devolve apenas JSON valido com formato: {\"summary\": string, \"questions\": string[]}"
].join("\n");

const COACH_SYSTEM_FALLBACK = [
  "Tu es um treinador de endurance + forca.",
  "Responde em Portugues europeu.",
  "Confronta os dados de treino da semana com as respostas do atleta.",
  "Devolve apenas JSON valido com formato:",
  "{\"alignment\": string, \"adjustments\": string[], \"final_feedback\": string}"
].join("\n");

function getModelName(modelName) {
  return modelName || DEFAULT_MODEL;
}

function safeJsonParse(content) {
  try {
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

function fallbackQuestions(summary, strengthManualConfirmation) {
  const hasStrength = Boolean(
    strengthManualConfirmation && strengthManualConfirmation.hasStrengthManualConfirmation
  );
  const strengthDone = hasStrength && Number.isInteger(strengthManualConfirmation.strengthPlannedDoneCount)
    ? strengthManualConfirmation.strengthPlannedDoneCount
    : 0;
  const strengthNotDone = hasStrength && Number.isInteger(strengthManualConfirmation.strengthPlannedNotDoneCount)
    ? strengthManualConfirmation.strengthPlannedNotDoneCount
    : 0;
  const questions = [
      "A tua percepcao de esforco desta semana bate com os picos de carga que vemos nos dados?",
      "Houve algum fator fora do treino (sono, trabalho, stress, nutricao) que tenha afetado a tua execucao?",
      "Sentiste necessidade de reduzir intensidade ou volume em algum dia? Em que sessao e por que razao?",
      "Como classificas a tua recuperacao geral (1-10) e quais os sinais que observaste no corpo?"
  ];
  if (hasStrength) {
    questions[3] = `No treino de forca, confirmaste ${strengthDone} sessoes planned done e ${strengthNotDone} planned not done. O que explica este resultado?`;
  }

  return {
    summary,
    questions
  };
}

function ensureStrengthQuestion(questions, strengthHint) {
  const list = Array.isArray(questions) ? questions.filter(Boolean) : [];
  const hasStrengthQuestion = list.some((q) => /forca|strength|ginasio|muscul/i.test(String(q)));
  if (hasStrengthQuestion) return list;

  const fallback = strengthHint
    ? `No treino de forca, como avalias a execucao tecnica e a tolerancia ao bloco desta semana (${strengthHint})?`
    : "No treino de forca, sentiste que cumpriste o que estava planeado em qualidade e consistencia?";
  return [...list.slice(0, 5), fallback];
}

function estimateTokens(...parts) {
  const text = parts
    .map((part) => (typeof part === "string" ? part : JSON.stringify(part || "")))
    .join("\n");
  return Math.ceil(text.length / 4);
}

async function loadSystemPrompt(config, feature, fallback) {
  if (!config || !config.supabaseUrl || !config.supabaseServiceRoleKey) {
    return fallback;
  }

  try {
    const prompt = await getActiveAiPrompt(config, feature, "system");
    return prompt && prompt.content ? String(prompt.content) : fallback;
  } catch (_err) {
    return fallback;
  }
}

async function safeInsertAiLog(config, payload) {
  if (!config || !config.supabaseUrl || !config.supabaseServiceRoleKey) return;
  try {
    await insertAiLog(config, payload);
  } catch (_err) {
    // Logging must never break check-in execution.
  }
}

function buildWeeklyUserPrompt({
  athlete,
  sessions,
  weekStart,
  weekEnd,
  hasStrengthManualConfirmation,
  strengthDone,
  strengthNotDone,
  totalStrengthSessionsDetected,
  manualStrengthFeedback,
  loadSummary
}) {
  return [
    `Atleta: ${athlete ? athlete.name || athlete.email || athlete.id : "desconhecido"}`,
    `Semana: ${weekStart} ate ${weekEnd}`,
    `Confirmacao manual de forca ativa: ${hasStrengthManualConfirmation ? "sim" : "nao"}`,
    `Forca planned done: ${strengthDone}`,
    `Forca planned not done: ${strengthNotDone}`,
    `Total sessoes de forca detectadas no upload: ${totalStrengthSessionsDetected === null ? "n/d" : totalStrengthSessionsDetected}`,
    `Feedback manual do coach sobre forca: ${manualStrengthFeedback || "(sem feedback textual)"}`,
    `Carga semanal calculada no LHT: ${JSON.stringify(loadSummary)}`,
    `Dados: ${JSON.stringify(sessions)}`
  ].join("\n");
}

function buildCoachUserPrompt({ athlete, checkin, answers }) {
  return [
    `Atleta: ${athlete ? athlete.name || athlete.email || athlete.id : "desconhecido"}`,
    `Resumo semana: ${checkin.training_summary || ""}`,
    `Perguntas feitas: ${JSON.stringify(checkin.ai_questions || [])}`,
    `Respostas do atleta: ${JSON.stringify(answers || {})}`
  ].join("\n");
}

async function generateWeeklyQuestions({
  config,
  apiKey,
  modelName,
  athlete,
  sessions,
  weekStart,
  weekEnd,
  strengthManualConfirmation,
  trainingLoadSummary,
  manualStrengthFeedback
}) {
  const basicSummary = `Semana ${weekStart} a ${weekEnd}: ${sessions.length} sessoes.`;
  const startTime = Date.now();

  const manual = strengthManualConfirmation || {};
  const hasStrengthManualConfirmation = Boolean(manual.hasStrengthManualConfirmation);
  const strengthDone = Number.isInteger(manual.strengthPlannedDoneCount) ? manual.strengthPlannedDoneCount : 0;
  const strengthNotDone = Number.isInteger(manual.strengthPlannedNotDoneCount) ? manual.strengthPlannedNotDoneCount : 0;
  const totalStrengthSessionsDetected = Number.isInteger(manual.totalStrengthSessionsDetected)
    ? manual.totalStrengthSessionsDetected
    : null;
  const strengthHint = `${strengthDone} planned done / ${strengthNotDone} planned not done`;
  const loadSummary = trainingLoadSummary || {};

  const systemPrompt = await loadSystemPrompt(config, WEEKLY_FEATURE, WEEKLY_SYSTEM_FALLBACK);
  const userPrompt = buildWeeklyUserPrompt({
    athlete,
    sessions,
    weekStart,
    weekEnd,
    hasStrengthManualConfirmation,
    strengthDone,
    strengthNotDone,
    totalStrengthSessionsDetected,
    manualStrengthFeedback,
    loadSummary
  });

  if (!apiKey) {
    const fallback = fallbackQuestions(basicSummary, strengthManualConfirmation);
    await safeInsertAiLog(config, {
      feature: WEEKLY_FEATURE,
      athlete_id: athlete && athlete.id ? athlete.id : null,
      model: "fallback:no_api_key",
      system_prompt_snapshot: systemPrompt,
      user_prompt_snapshot: userPrompt,
      input_data: {
        weekStart,
        weekEnd,
        sessionsCount: Array.isArray(sessions) ? sessions.length : 0,
        strengthManualConfirmation,
        trainingLoadSummary
      },
      output_data: fallback,
      tokens_estimated: estimateTokens(systemPrompt, userPrompt, fallback),
      duration_ms: Date.now() - startTime,
      success: false,
      error: "GEMINI_API_KEY missing"
    });
    return fallback;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${getModelName(modelName)}:generateContent`;
  const prompt = `${systemPrompt}\n\n${userPrompt}`;

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
    const fallback = fallbackQuestions(basicSummary, strengthManualConfirmation);
    await safeInsertAiLog(config, {
      feature: WEEKLY_FEATURE,
      athlete_id: athlete && athlete.id ? athlete.id : null,
      model: getModelName(modelName),
      system_prompt_snapshot: systemPrompt,
      user_prompt_snapshot: userPrompt,
      input_data: {
        weekStart,
        weekEnd,
        sessionsCount: Array.isArray(sessions) ? sessions.length : 0,
        strengthManualConfirmation,
        trainingLoadSummary
      },
      output_data: fallback,
      tokens_estimated: estimateTokens(prompt, fallback),
      duration_ms: Date.now() - startTime,
      success: false,
      error: `Gemini HTTP ${response.status}`
    });
    return fallback;
  }

  const payload = await response.json();
  const content = payload && payload.candidates && payload.candidates[0] && payload.candidates[0].content
    ? payload.candidates[0].content
    : null;

  const textPart = content && Array.isArray(content.parts) ? content.parts.find((p) => typeof p.text === "string") : null;
  const parsed = safeJsonParse(textPart ? textPart.text : "");
  if (!parsed || !Array.isArray(parsed.questions)) {
    const fallback = fallbackQuestions(basicSummary, strengthManualConfirmation);
    await safeInsertAiLog(config, {
      feature: WEEKLY_FEATURE,
      athlete_id: athlete && athlete.id ? athlete.id : null,
      model: getModelName(modelName),
      system_prompt_snapshot: systemPrompt,
      user_prompt_snapshot: userPrompt,
      input_data: {
        weekStart,
        weekEnd,
        sessionsCount: Array.isArray(sessions) ? sessions.length : 0,
        strengthManualConfirmation,
        trainingLoadSummary
      },
      output_data: fallback,
      tokens_estimated: estimateTokens(prompt, textPart ? textPart.text : "", fallback),
      duration_ms: Date.now() - startTime,
      success: false,
      error: "Invalid Gemini JSON format"
    });
    return fallback;
  }

  const generatedQuestions = hasStrengthManualConfirmation
    ? ensureStrengthQuestion(parsed.questions, strengthHint)
    : parsed.questions;

  const result = {
    summary: parsed.summary || basicSummary,
    questions: generatedQuestions.slice(0, 6)
  };

  await safeInsertAiLog(config, {
    feature: WEEKLY_FEATURE,
    athlete_id: athlete && athlete.id ? athlete.id : null,
    model: getModelName(modelName),
    system_prompt_snapshot: systemPrompt,
    user_prompt_snapshot: userPrompt,
    input_data: {
      weekStart,
      weekEnd,
      sessionsCount: Array.isArray(sessions) ? sessions.length : 0,
      strengthManualConfirmation,
      trainingLoadSummary
    },
    output_data: result,
    tokens_estimated: estimateTokens(prompt, result),
    duration_ms: Date.now() - startTime,
    success: true,
    error: null
  });

  return result;
}

async function generateCoachDraft({ config, apiKey, modelName, athlete, checkin, answers }) {
  const fallback = {
    alignment: "Analise pendente - Gemini indisponivel.",
    adjustments: ["Rever volume da semana seguinte com base na resposta do atleta."],
    final_feedback: "Obrigado pelo teu check-in. Vamos ajustar a proxima semana em funcao do teu feedback e dos dados recolhidos."
  };

  const startTime = Date.now();
  const systemPrompt = await loadSystemPrompt(config, COACH_FEATURE, COACH_SYSTEM_FALLBACK);
  const userPrompt = buildCoachUserPrompt({ athlete, checkin, answers });

  if (!apiKey) {
    await safeInsertAiLog(config, {
      feature: COACH_FEATURE,
      athlete_id: checkin && checkin.athlete_id ? checkin.athlete_id : athlete && athlete.id ? athlete.id : null,
      model: "fallback:no_api_key",
      system_prompt_snapshot: systemPrompt,
      user_prompt_snapshot: userPrompt,
      input_data: {
        checkinId: checkin && checkin.id ? checkin.id : null,
        questions: checkin && checkin.ai_questions ? checkin.ai_questions : [],
        answers
      },
      output_data: fallback,
      tokens_estimated: estimateTokens(systemPrompt, userPrompt, fallback),
      duration_ms: Date.now() - startTime,
      success: false,
      error: "GEMINI_API_KEY missing"
    });
    return fallback;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${getModelName(modelName)}:generateContent`;
  const prompt = `${systemPrompt}\n\n${userPrompt}`;

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
    await safeInsertAiLog(config, {
      feature: COACH_FEATURE,
      athlete_id: checkin && checkin.athlete_id ? checkin.athlete_id : athlete && athlete.id ? athlete.id : null,
      model: getModelName(modelName),
      system_prompt_snapshot: systemPrompt,
      user_prompt_snapshot: userPrompt,
      input_data: {
        checkinId: checkin && checkin.id ? checkin.id : null,
        questions: checkin && checkin.ai_questions ? checkin.ai_questions : [],
        answers
      },
      output_data: fallback,
      tokens_estimated: estimateTokens(prompt, fallback),
      duration_ms: Date.now() - startTime,
      success: false,
      error: `Gemini HTTP ${response.status}`
    });
    return fallback;
  }

  const payload = await response.json();
  const content = payload && payload.candidates && payload.candidates[0] && payload.candidates[0].content
    ? payload.candidates[0].content
    : null;

  const textPart = content && Array.isArray(content.parts) ? content.parts.find((p) => typeof p.text === "string") : null;
  const parsed = safeJsonParse(textPart ? textPart.text : "");

  if (!parsed || typeof parsed.final_feedback !== "string") {
    await safeInsertAiLog(config, {
      feature: COACH_FEATURE,
      athlete_id: checkin && checkin.athlete_id ? checkin.athlete_id : athlete && athlete.id ? athlete.id : null,
      model: getModelName(modelName),
      system_prompt_snapshot: systemPrompt,
      user_prompt_snapshot: userPrompt,
      input_data: {
        checkinId: checkin && checkin.id ? checkin.id : null,
        questions: checkin && checkin.ai_questions ? checkin.ai_questions : [],
        answers
      },
      output_data: fallback,
      tokens_estimated: estimateTokens(prompt, textPart ? textPart.text : "", fallback),
      duration_ms: Date.now() - startTime,
      success: false,
      error: "Invalid Gemini JSON format"
    });
    return fallback;
  }

  const result = {
    alignment: parsed.alignment || "",
    adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : [],
    final_feedback: parsed.final_feedback
  };

  await safeInsertAiLog(config, {
    feature: COACH_FEATURE,
    athlete_id: checkin && checkin.athlete_id ? checkin.athlete_id : athlete && athlete.id ? athlete.id : null,
    model: getModelName(modelName),
    system_prompt_snapshot: systemPrompt,
    user_prompt_snapshot: userPrompt,
    input_data: {
      checkinId: checkin && checkin.id ? checkin.id : null,
      questions: checkin && checkin.ai_questions ? checkin.ai_questions : [],
      answers
    },
    output_data: result,
    tokens_estimated: estimateTokens(prompt, result),
    duration_ms: Date.now() - startTime,
    success: true,
    error: null
  });

  return result;
}

module.exports = {
  generateWeeklyQuestions,
  generateCoachDraft
};
