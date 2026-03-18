const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getWeekStartIso } = require("./_lib/date");
const {
  getLatestTrainingLoadMetric,
  getTrainingLoadDailyRange,
  getTrainingLoadMetricsRange,
  verifyCoachOwnsAthlete
} = require("./_lib/supabase");
const { summarizeTrainingLoadWeek } = require("./_lib/training-load");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");

function endOfWeekIso(weekStartIso) {
  const date = new Date(`${weekStartIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);
    
    if (!user) {
      return json(401, { error: "Authentication required" });
    }

    const coachId = user.sub;
    const athleteId = event.queryStringParameters && event.queryStringParameters.athleteId
      ? event.queryStringParameters.athleteId
      : "";

    if (!athleteId) {
      return json(400, { error: "Missing athleteId" });
    }

    const owns = await verifyCoachOwnsAthlete(config, coachId, athleteId);
    if (!owns) {
      return json(403, { error: "Acesso negado ao atleta" });
    }

    const rawWeekStart = event.queryStringParameters && event.queryStringParameters.weekStart
      ? String(event.queryStringParameters.weekStart).trim()
      : "";

    if (rawWeekStart && !/^\d{4}-\d{2}-\d{2}$/.test(rawWeekStart)) {
      return json(400, { error: "Invalid weekStart format. Use YYYY-MM-DD." });
    }

    let weekStart = rawWeekStart;
    let weekEnd = "";
    let metricReferenceDate = "";

    if (!weekStart) {
      const latestMetric = await getLatestTrainingLoadMetric(config, athleteId);
      if (!latestMetric) {
        return json(200, { trainingLoadSummary: null });
      }

      metricReferenceDate = latestMetric.metric_date;
      weekStart = getWeekStartIso(metricReferenceDate);
      weekEnd = endOfWeekIso(weekStart);
    } else {
      weekEnd = endOfWeekIso(weekStart);
      metricReferenceDate = weekEnd;
    }

    const dailyRows = await getTrainingLoadDailyRange(config, athleteId, weekStart, weekEnd);
    const metricsRows = await getTrainingLoadMetricsRange(config, athleteId, weekStart, weekEnd);

    if ((!Array.isArray(dailyRows) || !dailyRows.length) && (!Array.isArray(metricsRows) || !metricsRows.length)) {
      return json(200, {
        trainingLoadSummary: null,
        weekStart,
        weekEnd
      });
    }

    const summary = summarizeTrainingLoadWeek(
      Array.isArray(dailyRows) ? dailyRows : [],
      Array.isArray(metricsRows) ? metricsRows : [],
      weekStart,
      weekEnd,
      metricReferenceDate
    );

    return json(200, {
      trainingLoadSummary: summary,
      weekStart,
      weekEnd
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao carregar carga de treino" });
  }
};
