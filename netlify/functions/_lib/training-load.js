function roundNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function isRunSession(session) {
  const sportType = String(session.sport_type || "").toLowerCase();
  const title = String(session.title || "").toLowerCase();
  return /run|corrida/.test(`${sportType} ${title}`);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function aggregateTrainingLoadDaily(athleteId, sessions) {
  const byDate = new Map();
  for (const session of sessions || []) {
    const loadDate = session.session_date;
    if (!loadDate) continue;
    const current = byDate.get(loadDate) || {
      athlete_id: athleteId,
      load_date: loadDate,
      daily_tss: 0,
      daily_duration_minutes: 0,
      daily_run_distance_km: 0,
      daily_work_kj: 0,
      session_count: 0,
      updated_at: new Date().toISOString()
    };

    current.daily_tss += toNumber(session.tss);
    current.daily_duration_minutes += Math.round(toNumber(session.duration_minutes));
    current.daily_work_kj += toNumber(session.work_kj);
    if (isRunSession(session)) {
      current.daily_run_distance_km += toNumber(session.distance_km);
    }
    current.session_count += 1;
    byDate.set(loadDate, current);
  }

  return Array.from(byDate.values())
    .sort((left, right) => left.load_date.localeCompare(right.load_date))
    .map((row) => ({
      ...row,
      daily_tss: roundNumber(row.daily_tss, 2),
      daily_run_distance_km: roundNumber(row.daily_run_distance_km, 2),
      daily_work_kj: roundNumber(row.daily_work_kj, 2)
    }));
}

function calculateTrainingLoadMetrics(athleteId, dailyRows, options = {}) {
  const ctlTimeConstant = options.ctlTimeConstant || 42;
  const atlTimeConstant = options.atlTimeConstant || 7;
  if (!dailyRows.length) return [];

  const sortedRows = [...dailyRows].sort((left, right) => left.load_date.localeCompare(right.load_date));
  const firstDate = sortedRows[0].load_date;
  const lastDate = sortedRows[sortedRows.length - 1].load_date;
  const loadMap = new Map(sortedRows.map((row) => [row.load_date, row]));

  let ctl = 0;
  let atl = 0;
  const metrics = [];

  for (let currentDate = firstDate; currentDate <= lastDate; currentDate = addDays(currentDate, 1)) {
    const daily = loadMap.get(currentDate);
    const dailyTss = daily ? toNumber(daily.daily_tss) : 0;
    ctl += (dailyTss - ctl) / ctlTimeConstant;
    atl += (dailyTss - atl) / atlTimeConstant;

    metrics.push({
      athlete_id: athleteId,
      metric_date: currentDate,
      daily_tss: roundNumber(dailyTss, 2),
      ctl: roundNumber(ctl, 2),
      atl: roundNumber(atl, 2),
      tsb: roundNumber(ctl - atl, 2),
      updated_at: new Date().toISOString()
    });
  }

  return metrics;
}

function formatDurationMinutes(totalMinutes) {
  const safeMinutes = Math.max(0, Math.round(toNumber(totalMinutes)));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function summarizeTrainingLoadWeek(dailyRows, metricsRows, weekStart, weekEnd, latestSessionDate) {
  const weekDaily = (dailyRows || []).filter((row) => row.load_date >= weekStart && row.load_date <= weekEnd);
  const metricsMap = new Map((metricsRows || []).map((row) => [row.metric_date, row]));
  const summaryMetric = metricsMap.get(latestSessionDate) || metricsMap.get(weekEnd) || metricsRows[metricsRows.length - 1] || null;

  const totalDurationMinutes = weekDaily.reduce((sum, row) => sum + toNumber(row.daily_duration_minutes), 0);
  const totalTss = weekDaily.reduce((sum, row) => sum + toNumber(row.daily_tss), 0);
  const runDistanceKm = weekDaily.reduce((sum, row) => sum + toNumber(row.daily_run_distance_km), 0);
  const workKj = weekDaily.reduce((sum, row) => sum + toNumber(row.daily_work_kj), 0);

  return {
    latestDate: latestSessionDate,
    weekStart,
    weekEnd,
    ctl: summaryMetric ? roundNumber(summaryMetric.ctl, 2) : 0,
    atl: summaryMetric ? roundNumber(summaryMetric.atl, 2) : 0,
    tsb: summaryMetric ? roundNumber(summaryMetric.tsb, 2) : 0,
    totalDurationMinutes: Math.round(totalDurationMinutes),
    totalDurationFormatted: formatDurationMinutes(totalDurationMinutes),
    totalTss: roundNumber(totalTss, 2),
    runDistanceKm: roundNumber(runDistanceKm, 2),
    workKj: roundNumber(workKj, 2)
  };
}

module.exports = {
  aggregateTrainingLoadDaily,
  calculateTrainingLoadMetrics,
  summarizeTrainingLoadWeek,
  formatDurationMinutes
};
