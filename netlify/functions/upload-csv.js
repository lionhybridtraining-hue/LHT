const crypto = require("crypto");
const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getWeekStartIso } = require("./_lib/date");
const { csvTextFromPayload, parseCsv, mapTrainingPeaksRecord } = require("./_lib/csv");
const { deriveUploadBatchId } = require("./_lib/upload-batch");
const {
  insertTrainingSessions,
  findExistingSessions,
  updateSessionResults,
  getAthleteById,
  getWeekSessions,
  createWeeklyCheckin
} = require("./_lib/supabase");
const { generateWeeklyQuestions } = require("./_lib/ai");

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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const payload = parseJsonBody(event);
    const athleteId = payload.athleteId;
    if (!athleteId) {
      return json(400, { error: "Missing athleteId" });
    }

    const csvText = csvTextFromPayload(payload);
    const parsed = parseCsv(csvText, payload.delimiter);
    if (!parsed.records.length) {
      return json(400, { error: "CSV vazio ou sem linhas de dados" });
    }

    const config = getConfig();
    const uploadBatchId = deriveUploadBatchId({
      athleteId,
      sourceFileName: payload.sourceFileName,
      uploadBatchId: payload.uploadBatchId
    });
    const sessions = parsed.records
      .map((record) => {
        const session = mapTrainingPeaksRecord(record, athleteId);
        return session ? { ...session, upload_batch_id: uploadBatchId } : null;
      })
      .filter(Boolean);

    if (!sessions.length) {
      return json(400, { error: "Nenhuma linha com data valida foi encontrada no CSV" });
    }

    // Find which sessions already exist
    const sessionKeys = sessions.map(s => ({
      session_date: s.session_date,
      title: s.title,
      sport_type: s.sport_type
    }));
    const existing = await findExistingSessions(config, athleteId, sessionKeys);
    const existingMap = new Map(
      existing.map((e) => [`${e.session_date}|${e.title}|${e.sport_type}`, e])
    );

    // Split into new and existing
    const toInsert = [];
    const toUpdate = [];
    for (const session of sessions) {
      const key = `${session.session_date}|${session.title}|${session.sport_type}`;
      const existingSession = existingMap.get(key);
      if (existingSession) {
        toUpdate.push({
          id: existingSession.id,
          tss: session.tss,
          intensity_factor: session.intensity_factor,
          avg_heart_rate: session.avg_heart_rate,
          avg_power: session.avg_power,
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

    const latestDate = sessions
      .map((s) => s.session_date)
      .sort()
      .slice(-1)[0];

    const weekStart = getWeekStartIso(latestDate);
    const weekEnd = endOfWeekIso(weekStart);

    const athlete = await getAthleteById(config, athleteId);
    const weekSessions = await getWeekSessions(config, athleteId, weekStart, weekEnd);
    const aiResult = await generateWeeklyQuestions({
      apiKey: config.geminiApiKey,
      modelName: config.geminiModel,
      athlete,
      sessions: weekSessions,
      weekStart,
      weekEnd
    });

    const token = crypto.randomUUID();
    const checkin = await createWeeklyCheckin(config, {
      athlete_id: athleteId,
      upload_batch_id: uploadBatchId,
      week_start: weekStart,
      status: "pending_athlete",
      training_summary: aiResult.summary,
      ai_questions: aiResult.questions,
      token,
      created_at: new Date().toISOString()
    });

    return json(200, {
      uploadBatchId,
      imported: inserted.length,
      updated: updateCount,
      total: inserted.length + updateCount,
      weekStart,
      weekEnd,
      executionSummary,
      checkinId: checkin ? checkin.id : null,
      checkinUrl: `${config.siteUrl.replace(/\/$/, "")}/check-in/?token=${token}`
    });
  } catch (err) {
    return json(500, { error: err.message || "Upload falhou" });
  }
};
