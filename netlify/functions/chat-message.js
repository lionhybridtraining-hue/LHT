const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");
const {
  getAthleteByIdentity,
  getOnboardingIntakeByIdentity,
  listWeeklyCheckinsByAthlete,
  getLatestTrainingLoadMetric,
  listTrainingSessionsForAthlete,
  getActiveInstanceForAthlete,
  getStrengthPlanFull,
  getAthlete1rmLatest,
  getActiveAiPrompt,
  insertAiLog,
} = require("./_lib/supabase");

const FEATURE = "athlete_chat";

const SYSTEM_FALLBACK = [
  "Tu es o assistente da Lion Hybrid Training (LHT).",
  "Tens acesso aos dados reais do atleta que estao incluidos no contexto abaixo.",
  "",
  "REGRAS:",
  "- Responde SEMPRE em portugues europeu.",
  "- Usa os dados do atleta para personalizar cada resposta.",
  "- Quando o atleta perguntar sobre carga: analisa CTL, ATL, TSB e sessoes recentes.",
  "- Quando perguntar sobre plano de forca: refere exercicios, series e progressao do plano activo.",
  "- Quando perguntar sobre check-in: resume feedback recente e tendencias.",
  "- Quando mencionarem dor ou lesao: recomenda SEMPRE reduzir carga e consultar profissional.",
  "- Se conciso (maximo 2-3 paragrafos).",
  "- Enfatiza consistencia acima de perfeicao.",
  "- Se nao tens dados suficientes para responder, diz isso e sugere o proximo passo.",
  "- Nunca inventes dados que nao estejam no contexto.",
  "- Quando sugiras ajustes, baseia-te nos principios: periodizacao, progressao sustentavel, equilibrio forca/endurance e prevencao de lesao."
].join("\n");

function safeSlice(arr, n) {
  return Array.isArray(arr) ? arr.slice(0, n) : [];
}

function summariseOnboarding(intake) {
  if (!intake) return null;
  return {
    name: intake.full_name || null,
    goal_distance: intake.goal_distance,
    weekly_frequency: intake.weekly_frequency,
    experience_level: intake.experience_level,
    consistency_level: intake.consistency_level,
    funnel_stage: intake.funnel_stage,
    answers: intake.answers || null,
  };
}

function summariseCheckins(checkins) {
  return safeSlice(checkins, 5).map((c) => ({
    week_start: c.week_start,
    status: c.status,
    training_summary: c.training_summary,
    strength_done: c.strength_planned_done_count,
    strength_not_done: c.strength_planned_not_done_count,
    coach_strength_feedback: c.coach_strength_feedback,
    responded_at: c.responded_at,
  }));
}

function summariseSessions(sessions) {
  return safeSlice(sessions, 14).map((s) => ({
    date: s.session_date,
    title: s.title,
    sport: s.sport_type,
    duration_min: s.duration_minutes,
    tss: s.tss,
    distance_km: s.distance_km,
  }));
}

function summariseStrengthPlan(instance, full) {
  if (!instance || !full) return null;
  const plan = full.plan || {};
  const exercises = (full.exercises || []).map((e) => ({
    day: e.day_number,
    section: e.section,
    exercise: e.exercise ? e.exercise.name : "?",
    category: e.exercise ? e.exercise.category : null,
  }));
  return {
    name: plan.name,
    total_weeks: plan.total_weeks,
    load_round: plan.load_round,
    status: instance.status,
    assigned_at: instance.assigned_at || instance.created_at,
    exercise_count: exercises.length,
    exercises: exercises.slice(0, 20),
  };
}

function summarise1rms(rms) {
  if (!Array.isArray(rms) || !rms.length) return null;
  return rms.map((r) => ({
    exercise: r.exercise_name || r.exercise_id,
    value_kg: r.value_kg,
    method: r.method,
    tested_at: r.tested_at,
  }));
}

function buildAthleteContext(data) {
  const ctx = {};
  if (data.athlete) {
    ctx.athlete = { name: data.athlete.name, email: data.athlete.email, status: data.athlete.status };
  }
  if (data.onboarding) ctx.onboarding = data.onboarding;
  if (data.trainingLoad) {
    const m = data.trainingLoad;
    ctx.training_load = { date: m.metric_date, ctl: m.ctl, atl: m.atl, tsb: m.tsb };
  }
  if (data.sessions && data.sessions.length) ctx.recent_sessions = data.sessions;
  if (data.checkins && data.checkins.length) ctx.recent_checkins = data.checkins;
  if (data.strengthPlan) ctx.strength_plan = data.strengthPlan;
  if (data.rms) ctx.one_rm = data.rms;
  return ctx;
}

function estimateTokens(...parts) {
  const text = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p || ""))).join("\n");
  return Math.ceil(text.length / 4);
}

function buildModelCandidates(primaryModel) {
  const candidates = [
    primaryModel,
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ]
    .map((m) => (m || "").trim())
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

async function callGeminiWithFallback({ apiKey, modelCandidates, requestBody }) {
  const attempts = [];

  for (const model of modelCandidates) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        ok: true,
        model,
        data,
        attempts,
      };
    }

    const errorText = await response.text();
    attempts.push({ model, status: response.status, errorText });
  }

  return {
    ok: false,
    model: modelCandidates[0] || "unknown",
    data: null,
    attempts,
  };
}

async function safeInsertAiLog(config, payload) {
  try {
    if (!config || !config.supabaseUrl || !config.supabaseServiceRoleKey) return;
    await insertAiLog(config, payload);
  } catch (_err) {
    // silently ignore log failures
  }
}

/**
 * Chat message handler — authenticates athlete and injects full context into Gemini.
 *
 * POST body: { message: string, conversationHistory: [{ role, content }] }
 */
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const startTime = Date.now();

  try {
    const config = getConfig();

    // ── Auth ─────────────────────────────────────────────────────────────
    const user = await getAuthenticatedUser(event, config);
    if (!user) {
      return json(401, { error: "Authentication required" });
    }

    // ── Parse body ───────────────────────────────────────────────────────
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (_err) {
      return json(400, { error: "Invalid JSON body" });
    }

    const { message, conversationHistory = [] } = body;
    if (!message || !message.trim()) {
      return json(400, { error: "Message is required" });
    }

    // ── API key ──────────────────────────────────────────────────────────
    const apiKey = config.geminiApiKey;
    if (!apiKey) {
      return json(500, { error: "Gemini API key not configured" });
    }

    // ── Load athlete data in parallel ────────────────────────────────────
    const identityId = user.sub;
    const athletePromise = getAthleteByIdentity(config, identityId).catch(() => null);
    const onboardingPromise = getOnboardingIntakeByIdentity(config, identityId).catch(() => null);

    const athlete = await athletePromise;
    const athleteId = athlete ? athlete.id : null;

    // Remaining queries need athleteId
    const [onboarding, rawCheckins, trainingLoad, rawSessions, strengthInstance, rawRms] =
      await Promise.all([
        onboardingPromise,
        athleteId ? listWeeklyCheckinsByAthlete(config, athleteId).catch(() => []) : [],
        athleteId ? getLatestTrainingLoadMetric(config, athleteId).catch(() => null) : null,
        athleteId ? listTrainingSessionsForAthlete(config, athleteId).catch(() => []) : [],
        athleteId ? getActiveInstanceForAthlete(config, athleteId).catch(() => null) : null,
        athleteId ? getAthlete1rmLatest(config, athleteId).catch(() => []) : [],
      ]);

    // Fetch full strength plan if instance exists
    let strengthPlan = null;
    if (strengthInstance && strengthInstance.plan_id) {
      try {
        const full = await getStrengthPlanFull(config, strengthInstance.plan_id);
        strengthPlan = summariseStrengthPlan(strengthInstance, full);
      } catch (_err) {
        // ignore
      }
    }

    const athleteContext = buildAthleteContext({
      athlete,
      onboarding: summariseOnboarding(onboarding),
      trainingLoad,
      sessions: summariseSessions(rawSessions),
      checkins: summariseCheckins(rawCheckins),
      strengthPlan,
      rms: summarise1rms(rawRms),
    });

    // ── System prompt ────────────────────────────────────────────────────
    let basePrompt = SYSTEM_FALLBACK;
    try {
      const dbPrompt = await getActiveAiPrompt(config, FEATURE, "system");
      if (dbPrompt && dbPrompt.content) basePrompt = String(dbPrompt.content);
    } catch (_err) {
      // use fallback
    }

    const systemPrompt =
      basePrompt +
      "\n\n--- DADOS DO ATLETA ---\n" +
      JSON.stringify(athleteContext, null, 2);

    // ── Build Gemini request ─────────────────────────────────────────────
    const modelName = config.geminiModel || "gemini-2.5-flash";
    const modelCandidates = buildModelCandidates(modelName);

    // Merge system prompt into first user turn (Gemini pattern used elsewhere)
    const prompt = `${systemPrompt}\n\n--- MENSAGEM DO ATLETA ---\n${message}`;

    const contents = [
      ...conversationHistory.map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      })),
      { role: "user", parts: [{ text: prompt }] },
    ];

    const geminiCall = await callGeminiWithFallback({
      apiKey,
      modelCandidates,
      requestBody: {
        contents,
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
      },
    });

    if (!geminiCall.ok) {
      const lastAttempt = geminiCall.attempts[geminiCall.attempts.length - 1] || null;
      const status = lastAttempt ? lastAttempt.status : 500;
      const detail = lastAttempt && lastAttempt.errorText
        ? String(lastAttempt.errorText).slice(0, 400)
        : "unknown_error";

      console.error("Gemini API error (all models failed):", {
        status,
        attempts: geminiCall.attempts.map((a) => ({ model: a.model, status: a.status })),
        detail,
      });

      await safeInsertAiLog(config, {
        feature: FEATURE,
        athlete_id: athleteId,
        model: `fallback_chain:${modelCandidates.join(",")}`,
        system_prompt_snapshot: basePrompt,
        user_prompt_snapshot: message,
        input_data: { athleteContext },
        output_data: null,
        tokens_estimated: estimateTokens(prompt),
        duration_ms: Date.now() - startTime,
        success: false,
        error: `Gemini HTTP ${status}`,
      });

      return json(500, { error: `Error calling Gemini API (HTTP ${status})` });
    }

    const geminiData = geminiCall.data;
    const usedModel = geminiCall.model;

    const candidate =
      geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content
        ? geminiData.candidates[0].content
        : null;

    if (!candidate) {
      await safeInsertAiLog(config, {
        feature: FEATURE,
        athlete_id: athleteId,
        model: usedModel,
        system_prompt_snapshot: basePrompt,
        user_prompt_snapshot: message,
        input_data: { athleteContext },
        output_data: geminiData,
        tokens_estimated: estimateTokens(prompt),
        duration_ms: Date.now() - startTime,
        success: false,
        error: "Invalid response from Gemini API",
      });
      return json(500, { error: "Invalid response from Gemini API" });
    }

    const textPart = Array.isArray(candidate.parts)
      ? candidate.parts.find((p) => typeof p.text === "string")
      : null;
    const assistantMessage = textPart ? textPart.text : "";

    const inputTokens = geminiData.usageMetadata?.promptTokenCount || 0;
    const outputTokens = geminiData.usageMetadata?.candidatesTokenCount || 0;

    // ── Log success ──────────────────────────────────────────────────────
    await safeInsertAiLog(config, {
      feature: FEATURE,
      athlete_id: athleteId,
      model: usedModel,
      system_prompt_snapshot: basePrompt,
      user_prompt_snapshot: message,
      input_data: { athleteContext, conversationLength: conversationHistory.length },
      output_data: { message: assistantMessage },
      tokens_estimated: inputTokens + outputTokens || estimateTokens(prompt, assistantMessage),
      duration_ms: Date.now() - startTime,
      success: true,
      error: null,
    });

    return json(200, {
      success: true,
      message: assistantMessage,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    });
  } catch (err) {
    console.error("Error in chat handler:", err);
    return json(500, { error: err.message || "Error processing message" });
  }
};
