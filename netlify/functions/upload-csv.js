const crypto = require("crypto");
const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getWeekStartIso } = require("./_lib/date");
const { csvTextFromPayload, parseCsv, mapTrainingPeaksRecord } = require("./_lib/csv");
const { deriveUploadBatchId } = require("./_lib/upload-batch");
const {
  aggregateTrainingLoadDaily,
  calculateTrainingLoadMetrics,
  summarizeTrainingLoadWeek
} = require("./_lib/training-load");
const {
  insertTrainingSessions,
  findExistingSessions,
  updateSessionResults,
  getAthleteById,
  getWeekSessions,
  listTrainingSessionsForAthlete,
  replaceTrainingLoadDaily,
  replaceTrainingLoadMetrics,
  createWeeklyCheckin,
  getWeeklyCheckinByBatch,
  verifyCoachOwnsAthlete
} = require("./_lib/supabase");
const { generateWeeklyQuestions } = require("./_lib/ai");
const { getAuthenticatedUser } = require("./_lib/auth-identity");

function isTruthy(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }

  if (typeof value === "number") {
    return value === 1;
  }

  return false;
}

function endOfWeekIso(weekStartIso) {
  const date = new Date(`${weekStartIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

function summarizeExecutionStatuses(sessions) {
  return sessions.reduce((summary, session) => {
    const key = session.execution_status || "unknown";
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
}

function parseNonNegativeInteger(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    return null;
  }
  return num;
}

function isStrengthSession(session) {
  const sportType = String(session.sport_type || "").toLowerCase();
  const title = String(session.normalized_title || session.title || "").toLowerCase();
  return /strength|forca|gym|muscul|weights/.test(`${sportType} ${title}`);
}

function normalizeSessionKeyPart(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getSessionLookupKeys(session) {
  const sessionDate = String(session.session_date || "").trim();
  const normalizedTitle = normalizeSessionKeyPart(session.normalized_title || session.title);
  const normalizedSportType = normalizeSessionKeyPart(session.sport_type);
  const rawTitle = String(session.title || "").trim();
  const rawSportType = String(session.sport_type || "").trim();

  return {
    normalizedKey: `${sessionDate}|${normalizedTitle}|${normalizedSportType}`,
    rawKey: `${sessionDate}|${rawTitle}|${rawSportType}`,
    normalizedDateTitleKey: `${sessionDate}|${normalizedTitle}`
  };
}

function deduplicateSessions(sessions) {
  const byNormalizedKey = new Map();
  for (const session of sessions || []) {
    const { normalizedKey } = getSessionLookupKeys(session);
    byNormalizedKey.set(normalizedKey, session);
  }
  return Array.from(byNormalizedKey.values());
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);
    
    if (!user) {
      return json(401, { error: "Authentication required" });
    }

    const coachId = user.sub;
    const payload = parseJsonBody(event);
    const athleteId = payload.athleteId;
    const skipCheckin = isTruthy(payload.skipCheckin);
    
    if (!athleteId) {
      return json(400, { error: "Missing athleteId" });
    }

    const owns = await verifyCoachOwnsAthlete(config, coachId, athleteId);
    if (!owns) {
      return json(403, { error: "Acesso negado ao atleta" });
    }

    const rawStrengthPlannedDoneCount = parseNonNegativeInteger(payload.strengthPlannedDoneCount);
    const rawStrengthPlannedNotDoneCount = parseNonNegativeInteger(payload.strengthPlannedNotDoneCount);
    if (!skipCheckin && (rawStrengthPlannedDoneCount === null || rawStrengthPlannedNotDoneCount === null)) {
      return json(400, {
        error: "Missing or invalid manual strength confirmation. Provide strengthPlannedDoneCount and strengthPlannedNotDoneCount as non-negative integers"
      });
    }
    const strengthPlannedDoneCount = skipCheckin ? 0 : rawStrengthPlannedDoneCount;
    const strengthPlannedNotDoneCount = skipCheckin ? 0 : rawStrengthPlannedNotDoneCount;
    const manualStrengthFeedback = typeof payload.manualStrengthFeedback === "string"
      ? payload.manualStrengthFeedback.trim()
      : "";

    const csvText = csvTextFromPayload(payload);
    const parsed = parseCsv(csvText, payload.delimiter);
    if (!parsed.records.length) {
      return json(400, { error: "CSV vazio ou sem linhas de dados" });
    }

    const uploadBatchId = deriveUploadBatchId({
      athleteId,
      sourceFileName: payload.sourceFileName,
      uploadBatchId: payload.uploadBatchId
    });
    const sessions = deduplicateSessions(parsed.records
      .map((record) => {
        const session = mapTrainingPeaksRecord(record, athleteId);
        return session ? { ...session, upload_batch_id: uploadBatchId } : null;
      })
      .filter(Boolean));

    if (!sessions.length) {
      return json(400, { error: "Nenhuma linha com data valida foi encontrada no CSV" });
    }

    // Find which sessions already exist
    const sessionKeys = sessions.map(s => ({
      session_date: s.session_date,
      title: s.title,
      sport_type: s.sport_type,
      normalized_title: s.normalized_title
    }));
    const existing = await findExistingSessions(config, athleteId, sessionKeys);
    const existingMap = new Map();
    for (const existingSession of existing || []) {
      const { normalizedKey, rawKey, normalizedDateTitleKey } = getSessionLookupKeys(existingSession);
      existingMap.set(normalizedKey, existingSession);
      existingMap.set(rawKey, existingSession);
      existingMap.set(normalizedDateTitleKey, existingSession);
    }

    // Split into new and existing
    const toInsert = [];
    const toUpdate = [];
    for (const session of sessions) {
      const { normalizedKey, rawKey, normalizedDateTitleKey } = getSessionLookupKeys(session);
      const existingSession =
        existingMap.get(normalizedKey) ||
        existingMap.get(rawKey) ||
        existingMap.get(normalizedDateTitleKey);
      if (existingSession) {
        toUpdate.push({
          id: existingSession.id,
          tss: session.tss,
          intensity_factor: session.intensity_factor,
          avg_heart_rate: session.avg_heart_rate,
          avg_power: session.avg_power,
          work_kj: session.work_kj,
          distance_km: session.distance_km,
          avg_pace: session.avg_pace
        });
      } else {
        toInsert.push(session);
      }
    }

    // Insert new and update existing
    const inserted = await insertTrainingSessions(config, toInsert);
    const updateCount = await updateSessionResults(config, toUpdate);

    const executionSummary = summarizeExecutionStatuses(sessions);
    const totalStrengthSessionsDetected = sessions.filter(isStrengthSession).length;
    const strengthCountMismatch =
      strengthPlannedDoneCount + strengthPlannedNotDoneCount > totalStrengthSessionsDetected;

    const latestDate = sessions
      .map((s) => s.session_date)
      .sort()
      .slice(-1)[0];

    const weekStart = getWeekStartIso(latestDate);
    const weekEnd = endOfWeekIso(weekStart);
    const allSessions = await listTrainingSessionsForAthlete(config, athleteId);
    const dailyLoadRows = aggregateTrainingLoadDaily(athleteId, Array.isArray(allSessions) ? allSessions : []);
    const metricsRows = calculateTrainingLoadMetrics(athleteId, dailyLoadRows);
    await replaceTrainingLoadDaily(config, athleteId, dailyLoadRows);
    await replaceTrainingLoadMetrics(config, athleteId, metricsRows);
    const trainingLoadSummary = summarizeTrainingLoadWeek(dailyLoadRows, metricsRows, weekStart, weekEnd, latestDate);

    let checkin = null;
    let reusedCheckin = false;
    let strengthConfirmationApplied = false;
    let strengthConfirmationWarning = null;

    if (!skipCheckin) {
      checkin = await getWeeklyCheckinByBatch(config, athleteId, uploadBatchId);
      reusedCheckin = Boolean(checkin);
      strengthConfirmationApplied = !reusedCheckin;
      strengthConfirmationWarning = strengthCountMismatch
        ? "Confirmacao manual de forca excede o total de sessoes de forca detetadas automaticamente. A contagem manual do coach foi mantida como fonte de verdade."
        : null;

      if (reusedCheckin && !checkin.has_strength_manual_confirmation) {
        return json(409, {
          error: "Batch ja existente sem confirmacao manual de forca. Cancela o batch e faz novo upload com confirmacao de forca.",
          uploadBatchId,
          totalStrengthSessionsDetected
        });
      }

      if (!checkin) {
        const athlete = await getAthleteById(config, athleteId);
        const weekSessions = await getWeekSessions(config, athleteId, weekStart, weekEnd);
        const aiResult = await generateWeeklyQuestions({
          apiKey: config.geminiApiKey,
          modelName: config.geminiModel,
          athlete,
          sessions: weekSessions,
          strengthManualConfirmation: {
            hasStrengthManualConfirmation: true,
            strengthPlannedDoneCount,
            strengthPlannedNotDoneCount,
            totalStrengthSessionsDetected
          },
          trainingLoadSummary,
          manualStrengthFeedback,
          weekStart,
          weekEnd
        });

        checkin = await createWeeklyCheckin(config, {
          athlete_id: athleteId,
          upload_batch_id: uploadBatchId,
          week_start: weekStart,
          status: "pending_athlete",
          has_strength_manual_confirmation: true,
          strength_planned_done_count: strengthPlannedDoneCount,
          strength_planned_not_done_count: strengthPlannedNotDoneCount,
          coach_strength_feedback: manualStrengthFeedback || null,
          training_summary: aiResult.summary,
          ai_questions: aiResult.questions,
          token: crypto.randomUUID(),
          created_at: new Date().toISOString()
        });
      } else {
        strengthConfirmationApplied = false;
        const existingDone = Number.isInteger(checkin.strength_planned_done_count)
          ? checkin.strength_planned_done_count
          : null;
        const existingNotDone = Number.isInteger(checkin.strength_planned_not_done_count)
          ? checkin.strength_planned_not_done_count
          : null;
        if (
          existingDone !== strengthPlannedDoneCount ||
          existingNotDone !== strengthPlannedNotDoneCount ||
          (manualStrengthFeedback && manualStrengthFeedback !== (checkin.coach_strength_feedback || ""))
        ) {
          strengthConfirmationWarning = "Batch ja existente: confirmacao manual de forca nao foi reaplicada. Cancela e reimporta para atualizar.";
        }
      }
    }

    return json(200, {
      skipCheckin,
      uploadBatchId,
      imported: inserted.length,
      updated: updateCount,
      total: inserted.length + updateCount,
      weekStart,
      weekEnd,
      reusedCheckin,
      totalStrengthSessionsDetected,
      strengthConfirmationApplied,
      strengthConfirmationWarning,
      strengthPlannedDoneCount: Number.isInteger(checkin && checkin.strength_planned_done_count)
        ? checkin.strength_planned_done_count
        : strengthPlannedDoneCount,
      strengthPlannedNotDoneCount: Number.isInteger(checkin && checkin.strength_planned_not_done_count)
        ? checkin.strength_planned_not_done_count
        : strengthPlannedNotDoneCount,
      trainingLoadSummary,
      executionSummary,
      checkinId: checkin ? checkin.id : null,
      checkinUrl: checkin && checkin.token
        ? `${config.siteUrl.replace(/\/$/, "")}/check-in/?token=${checkin.token}`
        : null
    });
  } catch (err) {
    return json(500, { error: err.message || "Upload falhou" });
  }
};
