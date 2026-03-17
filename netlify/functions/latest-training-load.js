const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getWeekStartIso } = require("./_lib/date");
const {
  getLatestTrainingLoadMetric,
  getTrainingLoadDailyRange
} = require("./_lib/supabase");
const { summarizeTrainingLoadWeek } = require("./_lib/training-load");

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
    const athleteId = event.queryStringParameters && event.queryStringParameters.athleteId
      ? event.queryStringParameters.athleteId
      : "";

    if (!athleteId) {
      return json(400, { error: "Missing athleteId" });
    }

    const config = getConfig();
    const latestMetric = await getLatestTrainingLoadMetric(config, athleteId);
    if (!latestMetric) {
      return json(200, { trainingLoadSummary: null });
    }

    const latestDate = latestMetric.metric_date;
    const weekStart = getWeekStartIso(latestDate);
    const weekEnd = endOfWeekIso(weekStart);
    const dailyRows = await getTrainingLoadDailyRange(config, athleteId, weekStart, weekEnd);

    const summary = summarizeTrainingLoadWeek(
      Array.isArray(dailyRows) ? dailyRows : [],
      [latestMetric],
      weekStart,
      weekEnd,
      latestDate
    );

    return json(200, { trainingLoadSummary: summary });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao carregar carga de treino" });
  }
};
