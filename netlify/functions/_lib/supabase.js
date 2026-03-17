async function supabaseRequest({ url, serviceRoleKey, path, method = "GET", body, prefer }) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: prefer || "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (err) {
    payload = text;
  }

  if (!response.ok) {
    const message = payload && payload.message ? payload.message : `Supabase error ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function insertTrainingSessions(config, sessions) {
  if (!sessions.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "training_sessions",
    method: "POST",
    body: sessions,
    prefer: "return=representation"
  });
}

async function findExistingSessions(config, athleteId, sessionKeys) {
  if (!sessionKeys.length) return [];

  // Get min and max dates from keys to minimize data fetched
  const dates = sessionKeys.map(k => k.session_date).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}&session_date=gte.${minDate}&session_date=lte.${maxDate}&select=id,session_date,title,sport_type,normalized_title`
  });
}

async function updateSessionResults(config, patchList) {
  if (!patchList.length) return 0;
  let updated = 0;
  for (const { id, tss, intensity_factor, avg_heart_rate, avg_power, work_kj, distance_km, avg_pace } of patchList) {
    try {
      await supabaseRequest({
        url: config.supabaseUrl,
        serviceRoleKey: config.supabaseServiceRoleKey,
        path: `training_sessions?id=eq.${encodeURIComponent(id)}`,
        method: "PATCH",
        body: {
          tss: tss ?? null,
          intensity_factor: intensity_factor ?? null,
          avg_heart_rate: avg_heart_rate ?? null,
          avg_power: avg_power ?? null,
          work_kj: work_kj ?? null,
          distance_km: distance_km ?? null,
          avg_pace: avg_pace ?? null
        }
      });
      updated++;
    } catch (err) {
      console.error(`Failed to update session ${id}:`, err.message);
    }
  }
  return updated;
}

async function getLatestUploadBatchId(config, athleteId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}&upload_batch_id=not.is.null&select=upload_batch_id,created_at&order=created_at.desc&limit=1`
  });
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows[0].upload_batch_id || null;
}

async function deleteTrainingSessionsByBatch(config, athleteId, uploadBatchId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}&upload_batch_id=eq.${encodeURIComponent(uploadBatchId)}`,
    method: "DELETE"
  });
  return Array.isArray(rows) ? rows.length : 0;
}

async function deleteWeeklyCheckinsByBatch(config, athleteId, uploadBatchId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `weekly_checkins?athlete_id=eq.${encodeURIComponent(athleteId)}&upload_batch_id=eq.${encodeURIComponent(uploadBatchId)}`,
    method: "DELETE"
  });
  return Array.isArray(rows) ? rows.length : 0;
}

async function getAthleteById(config, athleteId) {
  const result = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?id=eq.${encodeURIComponent(athleteId)}&select=*`
  });
  return Array.isArray(result) ? result[0] || null : null;
}

async function listAthletes(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "athletes?select=id,name,email&limit=200"
  });
}

async function createAthlete(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "athletes",
    method: "POST",
    body: [payload]
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getWeekSessions(config, athleteId, weekStart, weekEnd) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}&session_date=gte.${weekStart}&session_date=lte.${weekEnd}&order=session_date.asc`
  });
}

async function listTrainingSessionsForAthlete(config, athleteId) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}&select=session_date,title,sport_type,duration_minutes,tss,work_kj,distance_km&order=session_date.asc`
  });
}

async function replaceTrainingLoadDaily(config, athleteId, rows) {
  await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_load_daily?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE"
  });

  if (!rows.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "training_load_daily",
    method: "POST",
    body: rows,
    prefer: "return=representation"
  });
}

async function replaceTrainingLoadMetrics(config, athleteId, rows) {
  await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_load_metrics?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE"
  });

  if (!rows.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "training_load_metrics",
    method: "POST",
    body: rows,
    prefer: "return=representation"
  });
}

async function getLatestTrainingLoadMetric(config, athleteId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_load_metrics?athlete_id=eq.${encodeURIComponent(athleteId)}&select=*&order=metric_date.desc&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getTrainingLoadDailyRange(config, athleteId, startDate, endDate) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_load_daily?athlete_id=eq.${encodeURIComponent(athleteId)}&load_date=gte.${startDate}&load_date=lte.${endDate}&order=load_date.asc`
  });
}

async function getTrainingLoadMetricsRange(config, athleteId, startDate, endDate) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_load_metrics?athlete_id=eq.${encodeURIComponent(athleteId)}&metric_date=gte.${startDate}&metric_date=lte.${endDate}&order=metric_date.asc`
  });
}

async function createWeeklyCheckin(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "weekly_checkins",
    method: "POST",
    body: [payload]
  });
  return Array.isArray(rows) ? rows[0] : null;
}

async function getWeeklyCheckinByToken(config, token) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `weekly_checkins?token=eq.${encodeURIComponent(token)}&select=*`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getWeeklyCheckinByBatch(config, athleteId, uploadBatchId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `weekly_checkins?athlete_id=eq.${encodeURIComponent(athleteId)}&upload_batch_id=eq.${encodeURIComponent(uploadBatchId)}&select=*&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listWeeklyCheckinsByAthlete(config, athleteId) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `weekly_checkins?athlete_id=eq.${encodeURIComponent(athleteId)}&select=id,token,upload_batch_id,week_start,status,created_at,responded_at,approved_at,training_summary,has_strength_manual_confirmation,strength_planned_done_count,strength_planned_not_done_count,coach_strength_feedback&order=week_start.desc&limit=50`
  });
}

async function updateWeeklyCheckin(config, id, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `weekly_checkins?id=eq.${encodeURIComponent(id)}`,
    method: "PATCH",
    body: patch
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listPublishedBlogArticles(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "blog_articles?deleted_at=is.null&status=eq.published&select=id,slug,title,excerpt,category,content,status,published_at,created_at,updated_at&order=published_at.desc"
  });
}

async function getPublishedBlogArticleBySlug(config, slug) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_articles?deleted_at=is.null&status=eq.published&slug=eq.${encodeURIComponent(slug)}&select=id,slug,title,excerpt,category,content,status,published_at,created_at,updated_at&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listBlogArticlesAdmin(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "blog_articles?deleted_at=is.null&select=id,slug,title,excerpt,category,content,status,published_at,created_at,updated_at&order=updated_at.desc"
  });
}

async function createBlogArticle(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "blog_articles",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateBlogArticle(config, id, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_articles?id=eq.${encodeURIComponent(id)}&deleted_at=is.null`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function softDeleteBlogArticle(config, id) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_articles?id=eq.${encodeURIComponent(id)}&deleted_at=is.null`,
    method: "PATCH",
    body: {
      deleted_at: new Date().toISOString()
    },
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

module.exports = {
  insertTrainingSessions,
  findExistingSessions,
  updateSessionResults,
  getLatestUploadBatchId,
  deleteTrainingSessionsByBatch,
  deleteWeeklyCheckinsByBatch,
  getAthleteById,
  listAthletes,
  createAthlete,
  getWeekSessions,
  listTrainingSessionsForAthlete,
  replaceTrainingLoadDaily,
  replaceTrainingLoadMetrics,
  getLatestTrainingLoadMetric,
  getTrainingLoadDailyRange,
  getTrainingLoadMetricsRange,
  createWeeklyCheckin,
  getWeeklyCheckinByToken,
  getWeeklyCheckinByBatch,
  listWeeklyCheckinsByAthlete,
  updateWeeklyCheckin,
  listPublishedBlogArticles,
  getPublishedBlogArticleBySlug,
  listBlogArticlesAdmin,
  createBlogArticle,
  updateBlogArticle,
  softDeleteBlogArticle
};
