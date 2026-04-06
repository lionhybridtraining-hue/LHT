const { randomBytes } = require("crypto");

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
    const detail = payload && payload.message ? payload.message : `Supabase error ${response.status}`;
    const table = path.split("?")[0];
    const message = `${detail} [table: ${table}]`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
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

async function upsertTrainingSessionsBySource(config, sessions) {
  if (!sessions.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "training_sessions?on_conflict=athlete_id,source,source_session_id",
    method: "POST",
    body: sessions,
    prefer: "resolution=merge-duplicates,return=representation"
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

async function getAthleteByIdentity(config, identityId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?identity_id=eq.${encodeURIComponent(identityId)}&select=*&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getAthleteByEmail(config, email) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?email=eq.${encodeURIComponent(email)}&select=*&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateAthlete(config, athleteId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?id=eq.${encodeURIComponent(athleteId)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getStravaConnectionByAthleteId(config, athleteId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_strava_connections?athlete_id=eq.${encodeURIComponent(athleteId)}&select=*&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getStravaConnectionByStravaAthleteId(config, stravaAthleteId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_strava_connections?strava_athlete_id=eq.${encodeURIComponent(stravaAthleteId)}&select=*&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function upsertStravaConnection(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "athlete_strava_connections?on_conflict=athlete_id",
    method: "POST",
    body: [payload],
    prefer: "resolution=merge-duplicates,return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateStravaConnection(config, athleteId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_strava_connections?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createStravaSyncEvent(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "strava_sync_events",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function deleteTrainingSessionBySourceId(config, athleteId, source, sourceSessionId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}&source=eq.${encodeURIComponent(source)}&source_session_id=eq.${encodeURIComponent(sourceSessionId)}`,
    method: "DELETE"
  });
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * Patch TSS + intensity_factor on a training_session identified by athlete + source + source_session_id.
 */
async function patchSessionTSS(config, athleteId, sourceSessionId, { tss, intensityFactor, tssMethod }) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}&source=eq.strava&source_session_id=eq.${encodeURIComponent(sourceSessionId)}`,
    method: "PATCH",
    body: {
      tss: tss ?? null,
      intensity_factor: intensityFactor ?? null
    },
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function upsertAthleteByIdentity(config, { identityId, email, name }) {
  const normalizedIdentityId = typeof identityId === "string" ? identityId.trim() : "";
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const normalizedName = typeof name === "string" && name.trim() ? name.trim() : null;

  if (!normalizedIdentityId) {
    throw new Error("identityId is required");
  }

  if (!normalizedEmail) {
    throw new Error("email is required");
  }

  const existingByIdentity = await getAthleteByIdentity(config, normalizedIdentityId);
  if (existingByIdentity) {
    const patch = {};
    if (existingByIdentity.email !== normalizedEmail) {
      patch.email = normalizedEmail;
    }
    if (normalizedName && existingByIdentity.name !== normalizedName) {
      patch.name = normalizedName;
    }
    return Object.keys(patch).length
      ? updateAthlete(config, existingByIdentity.id, patch)
      : existingByIdentity;
  }

  const existingByEmail = await getAthleteByEmail(config, normalizedEmail);
  if (existingByEmail) {
    if (existingByEmail.identity_id && existingByEmail.identity_id !== normalizedIdentityId) {
      const conflictError = new Error("Athlete email already linked to another identity");
      conflictError.status = 409;
      conflictError.code = "athlete_identity_conflict";
      throw conflictError;
    }

    const patch = {
      identity_id: normalizedIdentityId
    };
    if (normalizedName && existingByEmail.name !== normalizedName) {
      patch.name = normalizedName;
    }
    if (existingByEmail.email !== normalizedEmail) {
      patch.email = normalizedEmail;
    }
    return updateAthlete(config, existingByEmail.id, patch);
  }

  try {
    return await createAthlete(config, {
      identity_id: normalizedIdentityId,
      email: normalizedEmail,
      name: normalizedName || normalizedEmail
    });
  } catch (err) {
    const retryByIdentity = await getAthleteByIdentity(config, normalizedIdentityId);
    if (retryByIdentity) {
      return retryByIdentity;
    }

    const retryByEmail = await getAthleteByEmail(config, normalizedEmail);
    if (retryByEmail) {
      if (retryByEmail.identity_id && retryByEmail.identity_id !== normalizedIdentityId) {
        const conflictError = new Error("Athlete email already linked to another identity");
        conflictError.status = 409;
        conflictError.code = "athlete_identity_conflict";
        throw conflictError;
      }

      return updateAthlete(config, retryByEmail.id, {
        identity_id: normalizedIdentityId,
        ...(normalizedName && retryByEmail.name !== normalizedName ? { name: normalizedName } : {})
      });
    }

    throw err;
  }
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

async function getWeeklyCheckinById(config, checkinId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `weekly_checkins?id=eq.${encodeURIComponent(checkinId)}&select=*&limit=1`
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
    path: `weekly_checkins?athlete_id=eq.${encodeURIComponent(athleteId)}&select=id,token,token_expires_at,submitted_via,submitted_by_identity_id,upload_batch_id,week_start,status,created_at,responded_at,approved_at,training_summary,has_strength_manual_confirmation,strength_planned_done_count,strength_planned_not_done_count,coach_strength_feedback&order=week_start.desc&limit=50`
  });
}

async function listWeeklyCheckinsByAthleteIds(config, athleteIds, { from, to, limit } = {}) {
  if (!Array.isArray(athleteIds) || athleteIds.length === 0) return [];
  const validIds = athleteIds
    .filter((id) => typeof id === "string" && id.length > 0)
    .slice(0, 1000);
  if (validIds.length === 0) return [];

  const params = [
    `athlete_id=in.(${validIds.map((id) => encodeURIComponent(id)).join(",")})`,
    "select=id,athlete_id,week_start,status,responded_at,approved_at,strength_planned_done_count,strength_planned_not_done_count",
    "order=week_start.desc"
  ];

  if (from) params.push(`week_start=gte.${encodeURIComponent(from)}`);
  if (to) params.push(`week_start=lte.${encodeURIComponent(to)}`);
  if (Number.isFinite(limit) && limit > 0) {
    params.push(`limit=${Math.min(limit, 10000)}`);
  }

  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `weekly_checkins?${params.join("&")}`
  });
}

async function getWeeklyCheckinDetail(config, checkinId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `weekly_checkins?id=eq.${encodeURIComponent(checkinId)}&select=*,athletes(id,name,email)&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
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

async function getBlogArticleById(config, id) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_articles?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=id,slug,title,excerpt,category,content,status,published_at,created_at,updated_at&limit=1`
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

async function getBlogArticleBySlugAny(config, slug) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_articles?slug=eq.${encodeURIComponent(slug)}&select=id,slug,deleted_at&order=created_at.asc&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
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
  const current = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_articles?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=id,slug&limit=1`
  });
  const currentRow = Array.isArray(current) ? current[0] || null : null;
  const slug = currentRow && currentRow.slug ? String(currentRow.slug).trim() : "";
  const archivedSuffix = `--deleted-${String(id).slice(0, 8).toLowerCase()}`;
  const archivedSlug = slug ? `${slug}${archivedSuffix}` : null;

  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_articles?id=eq.${encodeURIComponent(id)}&deleted_at=is.null`,
    method: "PATCH",
    body: {
      deleted_at: new Date().toISOString(),
      ...(archivedSlug ? { slug: archivedSlug } : {})
    },
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function archiveDeletedBlogArticleSlug(config, id) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_articles?id=eq.${encodeURIComponent(id)}&deleted_at=not.is.null&select=id,slug&limit=1`
  });
  const row = Array.isArray(rows) ? rows[0] || null : null;
  if (!row || !row.slug) return null;

  const currentSlug = String(row.slug).trim();
  if (currentSlug.includes("--deleted-")) return row;

  const archivedSlug = `${currentSlug}--deleted-${String(id).slice(0, 8).toLowerCase()}`;
  const updated = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_articles?id=eq.${encodeURIComponent(id)}&deleted_at=not.is.null`,
    method: "PATCH",
    body: { slug: archivedSlug },
    prefer: "return=representation"
  });
  return Array.isArray(updated) ? updated[0] || null : null;
}

async function listBlogCategories(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "blog_categories?deleted_at=is.null&select=id,name,is_locked,created_at,updated_at&order=is_locked.desc,name.asc"
  });
}

async function getBlogCategoryById(config, id) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_categories?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=id,name,is_locked,created_at,updated_at&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getBlogCategoryByName(config, name) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_categories?name=eq.${encodeURIComponent(name)}&deleted_at=is.null&select=id,name,is_locked,created_at,updated_at&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createBlogCategory(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "blog_categories",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateBlogCategory(config, id, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_categories?id=eq.${encodeURIComponent(id)}&deleted_at=is.null`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function reassignBlogArticlesCategory(config, fromCategory, toCategory) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_articles?category=eq.${encodeURIComponent(fromCategory)}&deleted_at=is.null`,
    method: "PATCH",
    body: { category: toCategory },
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows : [];
}

async function getBlogContentProductionByArticle(config, articleId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_content_production?article_id=eq.${encodeURIComponent(articleId)}&select=*&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function upsertBlogContentProduction(config, payload) {
  if (!payload || !payload.article_id) {
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: "blog_content_production",
      method: "POST",
      body: [payload],
      prefer: "return=representation"
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  const existing = await getBlogContentProductionByArticle(config, payload.article_id);
  if (existing && existing.id) {
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `blog_content_production?id=eq.${encodeURIComponent(existing.id)}`,
      method: "PATCH",
      body: payload,
      prefer: "return=representation"
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "blog_content_production",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateBlogContentProductionByArticle(config, articleId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_content_production?article_id=eq.${encodeURIComponent(articleId)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getBlogContentProductionById(config, id) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_content_production?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateBlogContentProductionById(config, id, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_content_production?id=eq.${encodeURIComponent(id)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insertBlogContentProduction(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "blog_content_production",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listStandaloneProductions(config, limit) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_content_production?article_id=is.null&select=*&order=updated_at.desc&limit=${limit || 20}`
  });
  return Array.isArray(rows) ? rows : [];
}

async function listAthletesByCoach(config, coachIdentityId) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?coach_identity_id=eq.${encodeURIComponent(coachIdentityId)}&select=id,name,email,identity_id&limit=200`
  });
}

async function getPayingStatusForAthletes(config, identityIds) {
  if (!Array.isArray(identityIds) || identityIds.length === 0) return {};
  const validIds = identityIds.filter((id) => typeof id === "string" && id.length > 0);
  if (validIds.length === 0) return {};

  // Fetch all PAID purchases (no date filtering here - we'll do it in JS)
  const inList = validIds.map((id) => encodeURIComponent(id)).join(",");
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?identity_id=in.(${inList})&status=eq.paid&select=identity_id,status,billing_type,program_id,expires_at,paid_at,source&order=paid_at.desc.nullslast`
  });

  const map = {};
  const now = new Date().getTime();
  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      if (row.identity_id && !map[row.identity_id]) {
        // Check if subscription is still valid (no expiry OR expiry is in the future)
        const isActive =
          !row.expires_at || new Date(row.expires_at).getTime() > now;
        
        if (isActive) {
          map[row.identity_id] = {
            isPaying: true,
            billingType: row.billing_type || "one_time",
            programId: row.program_id || null,
            paidAt: row.paid_at || null,
            expiresAt: row.expires_at || null,
            manualAccessActive: row.source === "admin_override"
          };
        }
      }
    });
  }
  return map;
}

async function getLatestPurchaseStatusForAthletes(config, identityIds) {
  if (!Array.isArray(identityIds) || identityIds.length === 0) return {};
  const validIds = identityIds.filter((id) => typeof id === "string" && id.length > 0);
  if (validIds.length === 0) return {};

  const inList = validIds.map((id) => encodeURIComponent(id)).join(",");
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?identity_id=in.(${inList})&select=identity_id,status,billing_type,program_id,expires_at,paid_at,source&order=paid_at.desc.nullslast,created_at.desc`
  });

  const map = {};
  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      if (row.identity_id && !map[row.identity_id]) {
        map[row.identity_id] = {
          status: row.status || null,
          billingType: row.billing_type || null,
          programId: row.program_id || null,
          paidAt: row.paid_at || null,
          expiresAt: row.expires_at || null,
          source: row.source || null
        };
      }
    });
  }

  return map;
}

async function createAthleteForCoach(config, coachIdentityId, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "athletes",
    method: "POST",
    body: [{ ...payload, coach_identity_id: coachIdentityId }]
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function verifyCoachOwnsAthlete(config, coachIdentityId, athleteId) {
  const athlete = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?id=eq.${encodeURIComponent(athleteId)}&coach_identity_id=eq.${encodeURIComponent(coachIdentityId)}&select=id`
  });
  return Array.isArray(athlete) && athlete.length > 0;
}

async function listAthleteTrainingZoneProfiles(config, athleteId) {
  const profiles = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_training_zone_profiles?athlete_id=eq.${encodeURIComponent(athleteId)}&select=*&order=modality.asc`
  });

  const profileList = Array.isArray(profiles) ? profiles : [];
  if (!profileList.length) return [];

  const profileIds = profileList
    .map((p) => p && p.id)
    .filter((id) => typeof id === "string" && id.length > 0);

  if (!profileIds.length) return profileList;

  const inList = profileIds.map((id) => encodeURIComponent(id)).join(",");
  const zones = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_training_zones?profile_id=in.(${inList})&select=*&order=zone_number.asc`
  });

  const zoneByProfile = new Map();
  (Array.isArray(zones) ? zones : []).forEach((row) => {
    const key = row.profile_id;
    if (!zoneByProfile.has(key)) zoneByProfile.set(key, []);
    zoneByProfile.get(key).push(row);
  });

  return profileList.map((profile) => ({
    ...profile,
    zones: zoneByProfile.get(profile.id) || []
  }));
}

async function upsertAthleteTrainingZoneProfile(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "athlete_training_zone_profiles?on_conflict=athlete_id,modality,metric_type",
    method: "POST",
    body: [payload],
    prefer: "resolution=merge-duplicates,return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function replaceAthleteTrainingZones(config, profileId, zones) {
  await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_training_zones?profile_id=eq.${encodeURIComponent(profileId)}`,
    method: "DELETE"
  });

  if (!Array.isArray(zones) || zones.length === 0) return [];

  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "athlete_training_zones",
    method: "POST",
    body: zones.map((z) => ({
      profile_id: profileId,
      zone_number: z.zone_number,
      min_value: z.min_value,
      max_value: z.max_value,
      label: z.label || null
    })),
    prefer: "return=representation"
  });

  return Array.isArray(rows) ? rows : [];
}

async function listUnassignedAthletes(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "athletes?coach_identity_id=is.null&select=id,name,email,created_at&order=created_at.desc&limit=500"
  });
}

async function assignUnassignedAthleteToCoach(config, athleteId, coachIdentityId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?id=eq.${encodeURIComponent(athleteId)}&coach_identity_id=is.null`,
    method: "PATCH",
    body: {
      coach_identity_id: coachIdentityId
    },
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function setAthleteCoachIdentity(config, athleteId, coachIdentityId) {
  const normalizedAthleteId = typeof athleteId === "string" ? athleteId.trim() : "";
  if (!normalizedAthleteId) {
    throw new Error("athleteId is required");
  }

  const payload = {
    coach_identity_id: coachIdentityId || null
  };

  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?id=eq.${encodeURIComponent(normalizedAthleteId)}`,
    method: "PATCH",
    body: payload,
    prefer: "return=representation"
  });

  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getUserRoleNames(config, identityId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `user_roles?identity_id=eq.${encodeURIComponent(identityId)}&select=app_roles(name)`
  });

  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => row && row.app_roles && row.app_roles.name)
    .filter((name) => typeof name === "string" && name.length > 0);
}

async function listCoaches(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "coaches?deleted_at=is.null&select=id,identity_id,email,name,timezone,capacity_limit,default_followup_type,status,created_at,updated_at&order=created_at.desc"
  });
}

async function getCoachByIdentityId(config, identityId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `coaches?identity_id=eq.${encodeURIComponent(identityId)}&deleted_at=is.null&select=id&limit=1`
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function createCoach(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "coaches",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateCoach(config, coachId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `coaches?id=eq.${encodeURIComponent(coachId)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listAssignmentHistory(config, athleteId, limit = 50) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_assignments?athlete_id=eq.${encodeURIComponent(athleteId)}&select=id,athlete_id,coach_id,training_program_id,start_date,duration_weeks,computed_end_date,actual_end_date,status,price_cents_snapshot,currency_snapshot,followup_type_snapshot,notes,created_at,updated_at&order=created_at.desc&limit=${limit}`
  });
}

async function listAllAthletesForAdmin(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "athletes?select=id,name,email,identity_id,coach_identity_id,created_at&order=created_at.desc&limit=500"
  });
}

async function listActiveAssignmentsWithPrograms(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "program_assignments?status=in.(active,scheduled,paused)&select=id,athlete_id,coach_id,training_program_id,status,start_date,duration_weeks,computed_end_date,notes,created_at&order=created_at.desc&limit=1000"
  });
}

/**
 * List assignments enriched with athlete name/email, coach name, program name.
 * Options:
 *   includeHistory: boolean — if true, includes completed/cancelled; default active-like only
 *   coachIdentityId: string|null — if set, filters to athletes.coach_identity_id = value (coach scoping)
 */
async function listEnrichedAssignments(config, { includeHistory = false, coachIdentityId = null } = {}) {
  const statusFilter = includeHistory
    ? ""
    : "status=in.(active,scheduled,paused)&";
  const select = "id,athlete_id,coach_id,training_program_id,status,start_date,duration_weeks,computed_end_date,notes,created_at,updated_at,athlete:athletes!inner(id,name,email,coach_identity_id),coach:coaches(name),training_program:training_programs(name)";
  let path = `program_assignments?${statusFilter}select=${encodeURIComponent(select)}&order=created_at.desc&limit=1000`;

  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path
  });

  if (!coachIdentityId) return rows;

  // Filter to only athletes owned by this coach
  return (Array.isArray(rows) ? rows : []).filter(
    (r) => r.athlete && r.athlete.coach_identity_id === coachIdentityId
  );
}

async function archiveAthlete(config, athleteId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?id=eq.${encodeURIComponent(athleteId)}`,
    method: "PATCH",
    body: { status: "archived", updated_at: new Date().toISOString() },
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function assignRoleToIdentity(config, identityId, roleName) {
  const roles = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `app_roles?name=eq.${encodeURIComponent(roleName)}&select=id&limit=1`
  });

  const roleId = Array.isArray(roles) && roles[0] ? roles[0].id : null;
  if (!roleId) {
    throw new Error(`Role not found: ${roleName}`);
  }

  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "user_roles",
    method: "POST",
    body: [{ identity_id: identityId, role_id: roleId }],
    prefer: "resolution=ignore-duplicates,return=representation"
  });

  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createAuthUser(config, email) {
  // Use a cryptographically secure temporary password.
  const tempPassword = randomBytes(24).toString("base64url");
  
  const response = await fetch(`${config.supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        auto_created: true,
        created_by_coach_flow: true
      }
    })
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (err) {
    payload = text;
  }

  if (!response.ok) {
    const message = payload && payload.message ? payload.message : `Supabase auth error ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

// Invites a user by email via Supabase Admin API.
// Creates the auth user and sends an invite email with a magic link.
// If the user already exists (confirmed), Supabase returns an error which callers should handle gracefully.
async function inviteAuthUser(config, email, userMetadata = {}) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/admin/invite`, {
    method: "POST",
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      data: {
        ...userMetadata
      }
    })
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message = payload
      ? (payload.error_description || payload.message || payload.error || `Supabase invite error ${response.status}`)
      : `Supabase invite error ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

async function getAuthUserByEmail(config, email) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail) return null;

  const headers = {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
    "Content-Type": "application/json"
  };

  const parseAuthPayload = async (response) => {
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    return payload;
  };

  // Helper: extract flat array of users from any GoTrue response shape
  const extractAllUsers = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.users)) return payload.users;
    if (payload.user && typeof payload.user === "object") return [payload.user];
    if (payload.id) return [payload];
    return [];
  };

  const findByEmail = (users) =>
    users.find((u) => {
      const e = typeof u.email === "string" ? u.email.trim().toLowerCase() : "";
      return e === normalizedEmail;
    }) || null;

  // Always list ALL users and match by email (most reliable across Supabase versions).
  for (let page = 1; page <= 50; page += 1) {
    const listResponse = await fetch(
      `${config.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=100`,
      { method: "GET", headers }
    );
    const listPayload = await parseAuthPayload(listResponse);

    if (!listResponse.ok) {
      const message = listPayload
        ? (listPayload.error_description || listPayload.message || listPayload.error || `Supabase auth users error ${listResponse.status}`)
        : `Supabase auth users error ${listResponse.status}`;
      const err = new Error(message);
      err.status = listResponse.status;
      err.payload = listPayload;
      throw err;
    }

    const users = extractAllUsers(listPayload);
    const matched = findByEmail(users);
    if (matched) return matched;

    if (users.length < 100) break;
  }

  return null;
}

function isMissingTrainingProgramsColumnError(err) {
  const message = String((err && err.message) || "").toLowerCase();
  return message.includes("column training_programs.") && message.includes("does not exist");
}

function markLegacyRecurringSchema(value) {
  if (!value || (typeof value !== "object" && !Array.isArray(value))) {
    return value;
  }
  try {
    Object.defineProperty(value, "__legacyRecurringSchema", {
      value: true,
      enumerable: false,
      configurable: true
    });
  } catch (_) {
    value.__legacyRecurringSchema = true;
  }
  return value;
}

function stripRecurringPricingProgramPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const sanitized = { ...payload };
  delete sanitized.recurring_price_monthly_cents;
  delete sanitized.recurring_price_quarterly_cents;
  delete sanitized.recurring_price_annual_cents;
  delete sanitized.stripe_price_id_monthly;
  delete sanitized.stripe_price_id_quarterly;
  delete sanitized.stripe_price_id_annual;
  return sanitized;
}

function payloadHasRecurringPricingFields(payload) {
  if (!payload || typeof payload !== "object") return false;
  const billingType = String(payload.billing_type || "").trim().toLowerCase();
  return (
    billingType === "recurring"
    || payload.recurring_price_monthly_cents != null
    || payload.recurring_price_quarterly_cents != null
    || payload.recurring_price_annual_cents != null
    || payload.stripe_price_id_monthly != null
    || payload.stripe_price_id_quarterly != null
    || payload.stripe_price_id_annual != null
  );
}

function buildRecurringSchemaMissingError() {
  const err = new Error("A base de dados ainda nao tem as colunas de recorrencia em training_programs. Aplica a migracao de recorrencia antes de usar billing recurring.");
  err.status = 409;
  err.code = "PROGRAM_RECURRING_SCHEMA_MISSING";
  return err;
}

async function listTrainingPrograms(config) {
  const eventSelect = "id,name,event_date,event_location,event_description,calendar_visible,calendar_highlight_rank,created_at,updated_at";
  const programSelect = `id,external_source,external_id,name,commercial_description,technical_description,description,image_url,duration_weeks,price_cents,recurring_price_monthly_cents,recurring_price_quarterly_cents,recurring_price_annual_cents,currency,stripe_product_id,stripe_price_id,stripe_price_id_monthly,stripe_price_id_quarterly,stripe_price_id_annual,billing_type,status,access_model,preset_selection,event_id,start_date,event:training_events(${eventSelect}),created_at,updated_at`;
  try {
    return await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `training_programs?deleted_at=is.null&select=${encodeURIComponent(programSelect)}&order=created_at.desc`
    });
  } catch (err) {
    if (!isMissingTrainingProgramsColumnError(err)) {
      throw err;
    }

    const legacyProgramSelect = `id,external_source,external_id,name,commercial_description,technical_description,description,image_url,duration_weeks,price_cents,currency,stripe_product_id,stripe_price_id,status,event_id,start_date,event:training_events(${eventSelect}),created_at,updated_at`;
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `training_programs?deleted_at=is.null&select=${encodeURIComponent(legacyProgramSelect)}&order=created_at.desc`
    });
    return markLegacyRecurringSchema(rows);
  }
}

async function listTrainingEvents(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "training_events?deleted_at=is.null&select=id,name,event_date,event_location,event_description,calendar_visible,calendar_highlight_rank,created_at,updated_at&order=event_date.asc.nullslast,name.asc"
  });
}

async function getTrainingEventById(config, id) {
  if (!id) return null;
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_events?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=id,name,event_date,event_location,event_description,calendar_visible,calendar_highlight_rank,created_at,updated_at&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createTrainingEvent(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "training_events",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateTrainingEvent(config, id, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_events?id=eq.${encodeURIComponent(id)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createTrainingProgram(config, payload) {
  try {
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: "training_programs",
      method: "POST",
      body: [payload],
      prefer: "return=representation"
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (err) {
    if (!isMissingTrainingProgramsColumnError(err)) {
      throw err;
    }
    if (payloadHasRecurringPricingFields(payload)) {
      throw buildRecurringSchemaMissingError();
    }

    const fallbackPayload = stripRecurringPricingProgramPayload(payload);
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: "training_programs",
      method: "POST",
      body: [fallbackPayload],
      prefer: "return=representation"
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }
}

async function updateTrainingProgram(config, id, patch) {
  try {
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `training_programs?id=eq.${encodeURIComponent(id)}`,
      method: "PATCH",
      body: patch,
      prefer: "return=representation"
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (err) {
    if (!isMissingTrainingProgramsColumnError(err)) {
      throw err;
    }
    if (payloadHasRecurringPricingFields(patch)) {
      throw buildRecurringSchemaMissingError();
    }

    const fallbackPatch = stripRecurringPricingProgramPayload(patch);
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `training_programs?id=eq.${encodeURIComponent(id)}`,
      method: "PATCH",
      body: fallbackPatch,
      prefer: "return=representation"
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }
}

async function getTrainingProgramById(config, id) {
  const eventSelect = "id,name,event_date,event_location,event_description,calendar_visible,calendar_highlight_rank,created_at,updated_at";
  const programSelect = `id,external_source,external_id,name,commercial_description,technical_description,description,image_url,duration_weeks,price_cents,recurring_price_monthly_cents,recurring_price_quarterly_cents,recurring_price_annual_cents,currency,status,access_model,preset_selection,stripe_product_id,stripe_price_id,stripe_price_id_monthly,stripe_price_id_quarterly,stripe_price_id_annual,billing_type,event_id,start_date,event:training_events(${eventSelect}),created_at,updated_at`;
  try {
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `training_programs?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=${encodeURIComponent(programSelect)}&limit=1`
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (err) {
    if (!isMissingTrainingProgramsColumnError(err)) {
      throw err;
    }

    const legacyProgramSelect = `id,external_source,external_id,name,commercial_description,technical_description,description,image_url,duration_weeks,price_cents,currency,status,stripe_product_id,stripe_price_id,event_id,start_date,event:training_events(${eventSelect}),created_at,updated_at`;
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `training_programs?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=${encodeURIComponent(legacyProgramSelect)}&limit=1`
    });
    const row = Array.isArray(rows) ? rows[0] || null : null;
    return row ? markLegacyRecurringSchema(row) : null;
  }
}

async function getTrainingProgramByExternalId(config, externalId) {
  const eventSelect = "id,name,event_date,event_location,event_description,calendar_visible,calendar_highlight_rank,created_at,updated_at";
  const programSelect = `id,external_source,external_id,name,commercial_description,technical_description,description,image_url,duration_weeks,price_cents,recurring_price_monthly_cents,recurring_price_quarterly_cents,recurring_price_annual_cents,currency,status,access_model,preset_selection,stripe_product_id,stripe_price_id,stripe_price_id_monthly,stripe_price_id_quarterly,stripe_price_id_annual,billing_type,event_id,start_date,event:training_events(${eventSelect}),created_at,updated_at`;
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_programs?external_id=eq.${encodeURIComponent(externalId)}&deleted_at=is.null&select=${encodeURIComponent(programSelect)}&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listPublicTrainingPrograms(config) {
  const eventSelect = "id,name,event_date,event_location,event_description,calendar_visible,calendar_highlight_rank,created_at,updated_at";
  const programSelect = `id,external_id,name,commercial_description,technical_description,description,image_url,duration_weeks,price_cents,recurring_price_monthly_cents,recurring_price_quarterly_cents,recurring_price_annual_cents,currency,billing_type,access_model,payment_model,event_id,start_date,event:training_events(${eventSelect}),created_at,updated_at`;
  try {
    return await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `training_programs?deleted_at=is.null&status=eq.active&select=${encodeURIComponent(programSelect)}&order=price_cents.asc,created_at.asc`
    });
  } catch (err) {
    if (!isMissingTrainingProgramsColumnError(err)) {
      throw err;
    }

    const legacyProgramSelect = `id,external_id,name,commercial_description,technical_description,description,image_url,duration_weeks,price_cents,currency,event_id,start_date,event:training_events(${eventSelect}),created_at,updated_at`;
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `training_programs?deleted_at=is.null&status=eq.active&select=${encodeURIComponent(legacyProgramSelect)}&order=price_cents.asc,created_at.asc`
    });
    return markLegacyRecurringSchema(rows);
  }
}

async function createStripePurchase(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "stripe_purchases",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function upsertStripePurchaseBySessionId(config, payload) {
  if (!payload || !payload.stripe_session_id) {
    throw new Error("stripe_session_id is required for session upsert");
  }

  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "stripe_purchases?on_conflict=stripe_session_id",
    method: "POST",
    body: [payload],
    prefer: "resolution=merge-duplicates,return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateStripePurchaseById(config, id, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?id=eq.${encodeURIComponent(id)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getStripePurchaseBySessionId(config, sessionId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=*&order=created_at.desc&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getStripePurchaseBySubscriptionId(config, subscriptionId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=*&order=created_at.desc&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getStripePurchaseByPaymentIntentId(config, paymentIntentId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&select=*&order=created_at.desc&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getActiveStripePurchaseForIdentity(config, { identityId, programId, atIso } = {}) {
  if (!identityId || !programId) {
    return null;
  }

  const comparisonTime = atIso || new Date().toISOString();

  // Check paid (one-time: null expires_at; recurring: not yet expired)
  let rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?identity_id=eq.${encodeURIComponent(identityId)}&program_id=eq.${encodeURIComponent(programId)}&status=eq.paid&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(comparisonTime)})&select=*&order=paid_at.desc.nullslast,created_at.desc&limit=1`
  });
  if (Array.isArray(rows) && rows[0]) return rows[0];

  // Check payment_failed but within grace period
  rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?identity_id=eq.${encodeURIComponent(identityId)}&program_id=eq.${encodeURIComponent(programId)}&status=eq.payment_failed&grace_period_ends_at=gt.${encodeURIComponent(comparisonTime)}&select=*&order=created_at.desc&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateStripePurchasesBySubscriptionId(config, subscriptionId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows : [];
}

async function updateStripePurchasesByPaymentIntentId(config, paymentIntentId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows : [];
}

async function upsertStripePurchaseByPaymentIntentId(config, payload) {
  if (!payload || !payload.stripe_payment_intent_id) {
    throw new Error("stripe_payment_intent_id is required for payment intent upsert");
  }

  const existing = await getStripePurchaseByPaymentIntentId(config, payload.stripe_payment_intent_id);
  if (existing && existing.id) {
    return updateStripePurchaseById(config, existing.id, payload);
  }

  return createStripePurchase(config, payload);
}

async function listStripePurchases(config, { status, programId, email, source, from, to, limit, offset } = {}) {
  const filters = ["select=*,training_programs(name)"];
  if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
  if (programId) filters.push(`program_id=eq.${encodeURIComponent(programId)}`);
  if (email) filters.push(`email=ilike.*${encodeURIComponent(email)}*`);
  if (source) filters.push(`source=eq.${encodeURIComponent(source)}`);
  if (from) filters.push(`created_at=gte.${encodeURIComponent(from)}`);
  if (to) filters.push(`created_at=lte.${encodeURIComponent(to)}`);
  filters.push("order=created_at.desc");
  if (Number.isFinite(limit) && limit > 0) filters.push(`limit=${limit}`);
  if (Number.isFinite(offset) && offset > 0) filters.push(`offset=${offset}`);
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?${filters.join("&")}`
  });
  return Array.isArray(rows) ? rows : [];
}

async function createProgramAssignment(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "program_assignments",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getCurrentProgramAssignment(config, athleteId, trainingProgramId) {
  if (!athleteId) return null;

  const baseFilters = [
    `athlete_id=eq.${encodeURIComponent(athleteId)}`,
    "select=*",
    "order=created_at.desc",
    "limit=1"
  ];

  if (trainingProgramId) {
    baseFilters.unshift(`training_program_id=eq.${encodeURIComponent(trainingProgramId)}`);
  }

  const activeLikeRows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_assignments?status=in.(\"scheduled\",\"active\",\"paused\")&${baseFilters.join("&")}`
  });

  if (Array.isArray(activeLikeRows) && activeLikeRows.length) {
    return activeLikeRows[0] || null;
  }

  const latestRows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_assignments?${baseFilters.join("&")}`
  });

  return Array.isArray(latestRows) ? latestRows[0] || null : null;
}

async function getActiveLikeProgramAssignment(config, athleteId, trainingProgramId) {
  if (!athleteId) return null;

  const filters = [
    `athlete_id=eq.${encodeURIComponent(athleteId)}`,
    'status=in.("scheduled","active","paused")',
    "select=*",
    "order=created_at.desc",
    "limit=1"
  ];

  if (trainingProgramId) {
    filters.unshift(`training_program_id=eq.${encodeURIComponent(trainingProgramId)}`);
  }

  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_assignments?${filters.join("&")}`
  });

  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getLatestCancellableProgramAssignment(config, athleteId, trainingProgramId) {
  if (!athleteId) return null;

  const filters = [
    `athlete_id=eq.${encodeURIComponent(athleteId)}`,
    'status=in.("scheduled","active","paused")',
    'select=*',
    'order=created_at.desc',
    'limit=1'
  ];

  if (trainingProgramId) {
    filters.unshift(`training_program_id=eq.${encodeURIComponent(trainingProgramId)}`);
  }

  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_assignments?${filters.join("&")}`
  });

  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getProgramAssignmentById(config, assignmentId) {
  if (!assignmentId) return null;
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_assignments?id=eq.${encodeURIComponent(assignmentId)}&select=*&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateProgramAssignment(config, assignmentId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_assignments?id=eq.${encodeURIComponent(assignmentId)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function setAssignmentPreset(config, assignmentId, presetId) {
  return updateProgramAssignment(config, assignmentId, {
    selected_preset_id: presetId
  });
}

async function listSiteMetadata(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_metadata?select=key,value,updated_at&order=key.asc"
  });
}

async function listSiteMetrics(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_metrics?select=id,sort_order,value,label,active,updated_at&order=sort_order.asc,updated_at.desc"
  });
}

async function listSiteReviews(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_reviews?select=id,sort_order,name,stars,text,meta,review_date,active,updated_at&order=sort_order.asc,updated_at.desc"
  });
}

async function listSiteLinks(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_links?select=key,url,updated_at&order=key.asc"
  });
}

async function replaceSiteMetadata(config, rows) {
  await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_metadata?key=not.is.null",
    method: "DELETE",
    prefer: "return=minimal"
  });

  if (!rows.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_metadata",
    method: "POST",
    body: rows,
    prefer: "return=representation"
  });
}

async function replaceSiteMetrics(config, rows) {
  await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_metrics?id=not.is.null",
    method: "DELETE",
    prefer: "return=minimal"
  });

  if (!rows.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_metrics",
    method: "POST",
    body: rows,
    prefer: "return=representation"
  });
}

async function replaceSiteReviews(config, rows) {
  await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_reviews?id=not.is.null",
    method: "DELETE",
    prefer: "return=minimal"
  });

  if (!rows.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_reviews",
    method: "POST",
    body: rows,
    prefer: "return=representation"
  });
}

async function replaceSiteLinks(config, rows) {
  await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_links?key=not.is.null",
    method: "DELETE",
    prefer: "return=minimal"
  });

  if (!rows.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_links",
    method: "POST",
    body: rows,
    prefer: "return=representation"
  });
}

async function listSiteFaqs(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_faqs?select=id,sort_order,question,answer,active,updated_at&order=sort_order.asc,updated_at.desc"
  });
}

async function replaceSiteFaqs(config, rows) {
  await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_faqs?id=not.is.null",
    method: "DELETE",
    prefer: "return=minimal"
  });

  if (!rows.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "site_faqs",
    method: "POST",
    body: rows,
    prefer: "return=representation"
  });
}

async function insertMetaLead(config, lead) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "meta_leads",
    method: "POST",
    body: lead,
    prefer: "return=representation,resolution=ignore-duplicates"
  });
}

async function listMetaLeads(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "meta_leads?order=received_at.desc&limit=200"
  });
}

async function updateMetaLead(config, id, patch) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `meta_leads?id=eq.${encodeURIComponent(id)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
}

async function listAiPrompts(config, { feature, type } = {}) {
  const params = [
    "select=id,name,feature,type,content,version,is_active,notes,created_at,updated_at",
    "order=feature.asc,type.asc,updated_at.desc"
  ];
  if (feature) params.push(`feature=eq.${encodeURIComponent(feature)}`);
  if (type) params.push(`type=eq.${encodeURIComponent(type)}`);

  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `ai_prompts?${params.join("&")}`
  });
}

async function getAiPromptById(config, id) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `ai_prompts?id=eq.${encodeURIComponent(id)}&select=id,name,feature,type,content,version,is_active,notes,created_at,updated_at&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getActiveAiPrompt(config, feature, type = "system") {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `ai_prompts?feature=eq.${encodeURIComponent(feature)}&type=eq.${encodeURIComponent(type)}&is_active=eq.true&select=id,name,feature,type,content,version,is_active,notes,created_at,updated_at&order=updated_at.desc&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createAiPrompt(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "ai_prompts",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateAiPrompt(config, id, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `ai_prompts?id=eq.${encodeURIComponent(id)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createAiPromptVersion(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "ai_prompt_versions",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listAiPromptVersions(config, promptId) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `ai_prompt_versions?prompt_id=eq.${encodeURIComponent(promptId)}&select=id,prompt_id,version,content,notes,created_at&order=version.desc,created_at.desc`
  });
}

async function insertAiLog(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "ai_logs",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listAiLogs(config, { feature, athleteId, success, from, to, limit } = {}) {
  const params = [
    "select=id,feature,athlete_id,model,system_prompt_snapshot,user_prompt_snapshot,input_data,output_data,tokens_estimated,duration_ms,success,error,created_at",
    "order=created_at.desc",
    `limit=${Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 100}`
  ];

  if (feature) params.push(`feature=eq.${encodeURIComponent(feature)}`);
  if (athleteId) params.push(`athlete_id=eq.${encodeURIComponent(athleteId)}`);
  if (typeof success === "boolean") params.push(`success=eq.${success}`);
  if (from) params.push(`created_at=gte.${encodeURIComponent(from)}`);
  if (to) params.push(`created_at=lte.${encodeURIComponent(to)}`);

  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `ai_logs?${params.join("&")}`
  });
}

// ── Strength Training helpers ──

async function listExercises(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "exercises?select=id,name,category,subcategory,video_url,description,default_weight_per_side,default_each_side,default_tempo,created_at,updated_at&order=category.asc,subcategory.asc,name.asc"
  });
}

async function getExercisesByIds(config, exerciseIds) {
  if (!exerciseIds || exerciseIds.length === 0) return [];
  const inList = exerciseIds.map((id) => `"${id}"`).join(",");
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `exercises?id=in.(${inList})&select=id,name,category,subcategory,video_url,description,default_weight_per_side,default_each_side,default_tempo,progression_of,regression_of`
  });
}

async function createExercise(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "exercises",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateExercise(config, id, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `exercises?id=eq.${encodeURIComponent(id)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listStrengthPlans(config, filters) {
  const params = ['select=id,name,description,total_weeks,start_date,status,training_program_id,created_by,created_at,updated_at', 'order=created_at.desc'];
  if (filters && filters.status) params.push(`status=eq.${encodeURIComponent(filters.status)}`);
  if (filters && filters.trainingProgramId) params.push(`training_program_id=eq.${encodeURIComponent(filters.trainingProgramId)}`);
  if (filters && filters.createdBy) params.push(`created_by=eq.${encodeURIComponent(filters.createdBy)}`);
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plans?${params.join('&')}`
  });
}

async function listStrengthPlanInstances(config, filters) {
  const params = ['select=*,plan:strength_plans(id,name,total_weeks,training_program_id,status)', 'order=created_at.desc'];
  if (filters && filters.athleteId) params.push(`athlete_id=eq.${encodeURIComponent(filters.athleteId)}`);
  if (filters && filters.status) params.push(`status=eq.${encodeURIComponent(filters.status)}`);
  if (filters && filters.planId) params.push(`plan_id=eq.${encodeURIComponent(filters.planId)}`);
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_instances?${params.join('&')}`
  });
}

async function getActiveInstanceForAthlete(config, athleteId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_instances?athlete_id=eq.${encodeURIComponent(athleteId)}&status=eq.active&select=*,plan:strength_plans(*)&order=created_at.desc&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getStrengthInstanceByStripePurchaseId(config, stripePurchaseId) {
  if (!stripePurchaseId) return null;
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_instances?stripe_purchase_id=eq.${encodeURIComponent(stripePurchaseId)}&select=*,plan:strength_plans(*)&order=created_at.desc&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createStrengthPlanInstance(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: 'strength_plan_instances',
    method: 'POST',
    body: [payload],
    prefer: 'return=representation'
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateStrengthPlanInstance(config, instanceId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_instances?id=eq.${encodeURIComponent(instanceId)}`,
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation'
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getStrengthPlanInstanceById(config, instanceId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_instances?id=eq.${encodeURIComponent(instanceId)}&select=*,plan:strength_plans(*)&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getStrengthPlanById(config, planId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plans?id=eq.${encodeURIComponent(planId)}&select=*&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listStrengthPlanDayLabels(config, planId) {
  return await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_day_labels?plan_id=eq.${encodeURIComponent(planId)}&select=id,plan_id,day_number,day_label&order=day_number.asc`
  });
}

async function upsertStrengthPlanDayLabels(config, entries) {
  if (!entries.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "strength_plan_day_labels?on_conflict=plan_id,day_number",
    method: "POST",
    body: entries,
    prefer: "return=representation,resolution=merge-duplicates"
  });
}

async function deleteStrengthPlanDayLabelsByDays(config, planId, dayNumbers) {
  if (!dayNumbers.length) return 0;
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_day_labels?plan_id=eq.${encodeURIComponent(planId)}&day_number=in.(${dayNumbers.join(",")})`,
    method: "DELETE"
  });
  return Array.isArray(rows) ? rows.length : 0;
}

async function getStrengthPlanFull(config, planId) {
  const plan = await getStrengthPlanById(config, planId);
  if (!plan) return null;

  const exercises = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_exercises?plan_id=eq.${encodeURIComponent(planId)}&select=id,plan_id,day_number,section,superset_group,exercise_order,exercise_id,each_side,weight_per_side,plyo_mechanical_load,rm_percent_increase_per_week,alt_progression_exercise_id,alt_regression_exercise_id,created_at&order=day_number.asc,exercise_order.asc`
  });

  // Avoid PostgREST relationship ambiguity by hydrating exercise records explicitly.
  const exerciseIdSet = new Set();
  for (const pe of (exercises || [])) {
    if (pe.exercise_id) exerciseIdSet.add(pe.exercise_id);
    if (pe.alt_progression_exercise_id) exerciseIdSet.add(pe.alt_progression_exercise_id);
    if (pe.alt_regression_exercise_id) exerciseIdSet.add(pe.alt_regression_exercise_id);
  }

  let exerciseMap = {};
  if (exerciseIdSet.size > 0) {
    const exerciseRows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `exercises?id=in.(${Array.from(exerciseIdSet).join(",")})&select=id,name,category,subcategory,video_url,description,default_weight_per_side,default_each_side,default_tempo,progression_of,regression_of`
    });

    exerciseMap = (exerciseRows || []).reduce((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {});
  }

  const hydratedExercises = (exercises || []).map(pe => ({
    ...pe,
    exercise: pe.exercise_id ? exerciseMap[pe.exercise_id] || null : null,
    alt_progression_exercise: pe.alt_progression_exercise_id ? exerciseMap[pe.alt_progression_exercise_id] || null : null,
    alt_regression_exercise: pe.alt_regression_exercise_id ? exerciseMap[pe.alt_regression_exercise_id] || null : null
  }));

  const exerciseIds = (exercises || []).map(e => e.id);
  let prescriptions = [];
  if (exerciseIds.length > 0) {
    prescriptions = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `strength_prescriptions?plan_exercise_id=in.(${exerciseIds.join(",")})&select=*&order=week_number.asc`
    });
  }

  const phaseNotes = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_phase_notes?plan_id=eq.${encodeURIComponent(planId)}&select=*&order=day_number.asc,week_number.asc`
  });

  const dayLabels = await listStrengthPlanDayLabels(config, planId);

  return { plan, exercises: hydratedExercises, prescriptions: prescriptions || [], phaseNotes: phaseNotes || [], dayLabels: dayLabels || [] };
}

async function createStrengthPlan(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "strength_plans",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateStrengthPlan(config, planId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plans?id=eq.${encodeURIComponent(planId)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listStrengthWarmupPresets(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "strength_warmup_presets?select=id,name,description,payload,created_by,created_at,updated_at&order=updated_at.desc"
  });
}

async function createStrengthWarmupPreset(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "strength_warmup_presets",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateStrengthWarmupPreset(config, presetId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_warmup_presets?id=eq.${encodeURIComponent(presetId)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function deleteStrengthWarmupPreset(config, presetId) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_warmup_presets?id=eq.${encodeURIComponent(presetId)}`,
    method: "DELETE"
  });
}

async function upsertStrengthPlanExercises(config, exercises) {
  if (!exercises.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "strength_plan_exercises",
    method: "POST",
    body: exercises,
    prefer: "return=representation,resolution=merge-duplicates"
  });
}

async function deleteStrengthPlanExercises(config, exerciseIds) {
  if (!exerciseIds.length) return;
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_exercises?id=in.(${exerciseIds.join(",")})`,
    method: "DELETE"
  });
}

async function getStrengthPlanExercisesByIds(config, ids) {
  if (!ids.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_exercises?id=in.(${ids.join(",")})&select=id,exercise_id`
  });
}

async function upsertStrengthPrescriptions(config, prescriptions) {
  if (!prescriptions.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "strength_prescriptions?on_conflict=plan_exercise_id,week_number",
    method: "POST",
    body: prescriptions,
    prefer: "return=representation,resolution=merge-duplicates"
  });
}

async function upsertStrengthPlanPhaseNotes(config, notes) {
  if (!notes.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "strength_plan_phase_notes?on_conflict=plan_id,day_number,section,week_number",
    method: "POST",
    body: notes,
    prefer: "return=representation,resolution=merge-duplicates"
  });
}

async function getAthlete1rms(config, athleteId) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_exercise_1rm?athlete_id=eq.${encodeURIComponent(athleteId)}&select=*&order=exercise_id.asc,created_at.desc`
  });
}

async function getAthlete1rmLatest(config, athleteId) {
  // Supabase doesn't support DISTINCT ON, so we get all and dedupe in JS
  const all = await getAthlete1rms(config, athleteId);
  const latest = {};
  for (const row of (all || [])) {
    if (!latest[row.exercise_id]) {
      latest[row.exercise_id] = row;
    }
  }
  return Object.values(latest);
}

async function get1rmHistory(config, athleteId, exerciseId) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_exercise_1rm?athlete_id=eq.${encodeURIComponent(athleteId)}&exercise_id=eq.${encodeURIComponent(exerciseId)}&select=*&order=created_at.desc`
  });
}

async function insertAthlete1rm(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "athlete_exercise_1rm",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insertStrengthLogSets(config, sets) {
  if (!sets.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "strength_log_sets",
    method: "POST",
    body: sets,
    prefer: "return=representation,resolution=merge-duplicates"
  });
}

async function getStrengthLogs(config, athleteId, planId, weekNumber) {
  const params = [
    `athlete_id=eq.${encodeURIComponent(athleteId)}`,
    `plan_id=eq.${encodeURIComponent(planId)}`,
    "select=*",
    "order=day_number.asc,set_number.asc"
  ];
  if (weekNumber != null) {
    params.push(`week_number=eq.${encodeURIComponent(weekNumber)}`);
  }
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_log_sets?${params.join("&")}`
  });
}

async function getStrengthLogsByDateRange(config, athleteId, from, to) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_log_sets?athlete_id=eq.${encodeURIComponent(athleteId)}&session_date=gte.${encodeURIComponent(from)}&session_date=lte.${encodeURIComponent(to)}&select=*&order=session_date.asc,set_number.asc`
  });
}

// ── Strength Log Sessions ──

async function createStrengthLogSession(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "strength_log_sessions",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateStrengthLogSession(config, sessionId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_log_sessions?id=eq.${encodeURIComponent(sessionId)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getStrengthLogSession(config, sessionId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_log_sessions?id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function findActiveStrengthSession(config, athleteId, planId, weekNumber, dayNumber) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_log_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}&plan_id=eq.${encodeURIComponent(planId)}&week_number=eq.${encodeURIComponent(weekNumber)}&day_number=eq.${encodeURIComponent(dayNumber)}&status=eq.in_progress&select=*&order=created_at.desc&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getInProgressStrengthSessionForInstanceOnDate(config, instanceId, sessionDate) {
  if (!instanceId || !sessionDate) return null;
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_log_sessions?instance_id=eq.${encodeURIComponent(instanceId)}&session_date=eq.${encodeURIComponent(sessionDate)}&status=eq.in_progress&select=*&order=created_at.desc&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function cancelOrphanedSessions(config, athleteId, maxAgeHours = 4) {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_log_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}&status=eq.in_progress&started_at=lt.${encodeURIComponent(cutoff)}`,
    method: "PATCH",
    body: { cancelled_at: new Date().toISOString(), status: "cancelled" },
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows.length : 0;
}

async function getStrengthSessionHistory(config, athleteId, planId, limit = 20) {
  const params = [
    `athlete_id=eq.${encodeURIComponent(athleteId)}`,
    `status=eq.completed`,
    "select=*",
    "order=started_at.desc",
    `limit=${limit}`
  ];
  if (planId) {
    params.push(`plan_id=eq.${encodeURIComponent(planId)}`);
  }
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_log_sessions?${params.join("&")}`
  });
}

async function getStrengthLogSetsForSessions(config, sessionIds) {
  if (!sessionIds || sessionIds.length === 0) return [];
  const inList = sessionIds.map(id => `"${id}"`).join(",");
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_log_sets?session_id=in.(${inList})&select=*&order=set_number.asc`
  });
}

async function getOnboardingIntakeByIdentity(config, identityId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?identity_id=eq.${encodeURIComponent(identityId)}&select=id,identity_id,email,name,phone,goal_distance,weekly_frequency,experience_level,consistency_level,funnel_stage,plan_generated_at,plan_storage,onboarding_answers,onboarding_submitted_at,onboarding_updated_at&limit=1`
  });
  if (!Array.isArray(rows) || !rows.length) return null;

  const athlete = rows[0];
  return {
    id: athlete.id,
    identity_id: athlete.identity_id,
    athlete_id: athlete.id,
    email: athlete.email || null,
    phone: athlete.phone || null,
    full_name: athlete.name || null,
    goal_distance: athlete.goal_distance ?? null,
    weekly_frequency: athlete.weekly_frequency ?? null,
    experience_level: athlete.experience_level || null,
    consistency_level: athlete.consistency_level || null,
    funnel_stage: athlete.funnel_stage || null,
    plan_generated_at: athlete.plan_generated_at || null,
    plan_storage: athlete.plan_storage || null,
    answers:
      athlete.onboarding_answers && typeof athlete.onboarding_answers === "object"
        ? athlete.onboarding_answers
        : {},
    submitted_at: athlete.onboarding_submitted_at || null,
    updated_at: athlete.onboarding_updated_at || null
  };
}

async function getOnboardingFormResponsesByIdentity(config, identityId) {
  try {
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `onboarding_form_responses?identity_id=eq.${encodeURIComponent(identityId)}&select=*&order=updated_at.desc&limit=1`
    });
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (error) {
    const message = (error && error.message) || "";
    if (message.includes("onboarding_form_responses") || message.includes("relation")) {
      return null;
    }
    throw error;
  }
}

// ── Self-serve athlete: purchases and instances ──

async function getStripePurchasesForIdentity(config, identityId) {
  const now = new Date().toISOString();
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?identity_id=eq.${encodeURIComponent(identityId)}&select=*,training_programs(id,name,access_model,duration_weeks,billing_type)&or=(status.eq.paid,and(status.eq.payment_failed,grace_period_ends_at.gt.${encodeURIComponent(now)}))&order=created_at.desc`
  });
  return Array.isArray(rows) ? rows : [];
}

async function getAllInstancesForAthlete(config, athleteId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_instances?athlete_id=eq.${encodeURIComponent(athleteId)}&select=*,plan:strength_plans(id,name,total_weeks,training_program_id)&order=created_at.desc`
  });
  return Array.isArray(rows) ? rows : [];
}

async function getActiveAssignmentsForAthlete(config, athleteId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_assignments?athlete_id=eq.${encodeURIComponent(athleteId)}&status=in.(active,scheduled,paused)&select=id,athlete_id,coach_id,training_program_id,start_date,duration_weeks,computed_end_date,status,selected_preset_id,created_at,training_program:training_programs(id,name,access_model,duration_weeks,billing_type,preset_selection)&order=created_at.desc`
  });
  return Array.isArray(rows) ? rows : [];
}

// ── Webhook: subscription lifecycle sync ──

async function getStripePurchasesBySubscriptionId(config, subscriptionId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=*`
  });
  return Array.isArray(rows) ? rows : [];
}

async function pauseInstancesByStripeSubscription(config, subscriptionId) {
  const purchases = await getStripePurchasesBySubscriptionId(config, subscriptionId);
  if (!purchases.length) return [];
  const paused = [];
  for (const purchase of purchases) {
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `strength_plan_instances?stripe_purchase_id=eq.${encodeURIComponent(purchase.id)}&status=eq.active`,
      method: 'PATCH',
      body: { status: 'paused' },
      prefer: 'return=representation'
    });
    if (Array.isArray(rows)) paused.push(...rows);
  }
  return paused;
}

async function resumeInstancesByStripeSubscription(config, subscriptionId) {
  const purchases = await getStripePurchasesBySubscriptionId(config, subscriptionId);
  if (!purchases.length) return [];
  const resumed = [];
  for (const purchase of purchases) {
    const rows = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `strength_plan_instances?stripe_purchase_id=eq.${encodeURIComponent(purchase.id)}&status=eq.paused&access_model=eq.coached_recurring`,
      method: 'PATCH',
      body: { status: 'active' },
      prefer: 'return=representation'
    });
    if (Array.isArray(rows)) resumed.push(...rows);
  }
  return resumed;
}

// ═══════════════════════════════════════════════════════════
// Program Weekly Sessions
// ═══════════════════════════════════════════════════════════

async function listProgramWeeklySessions(config, trainingProgramId) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_weekly_sessions?training_program_id=eq.${encodeURIComponent(trainingProgramId)}&order=sort_priority.asc`
  });
}

async function upsertProgramWeeklySessions(config, sessions) {
  if (!sessions.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: 'program_weekly_sessions?on_conflict=training_program_id,session_key',
    method: 'POST',
    body: sessions,
    prefer: 'return=representation,resolution=merge-duplicates'
  });
}

async function deleteProgramWeeklySessions(config, ids) {
  if (!ids.length) return 0;
  const filter = ids.map(id => encodeURIComponent(id)).join(',');
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_weekly_sessions?id=in.(${filter})`,
    method: 'DELETE'
  });
  return Array.isArray(rows) ? rows.length : 0;
}

// ═══════════════════════════════════════════════════════════
// Program Schedule Presets
// ═══════════════════════════════════════════════════════════

async function listProgramSchedulePresets(config, trainingProgramId) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_schedule_presets?training_program_id=eq.${encodeURIComponent(trainingProgramId)}&order=sort_order.asc`
  });
}

async function getProgramSchedulePresetById(config, presetId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_schedule_presets?id=eq.${encodeURIComponent(presetId)}&select=*`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createProgramSchedulePreset(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: 'program_schedule_presets',
    method: 'POST',
    body: [payload]
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateProgramSchedulePreset(config, presetId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_schedule_presets?id=eq.${encodeURIComponent(presetId)}`,
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation'
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function deleteProgramSchedulePreset(config, presetId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_schedule_presets?id=eq.${encodeURIComponent(presetId)}`,
    method: 'DELETE'
  });
  return Array.isArray(rows) ? rows.length : 0;
}

// ═══════════════════════════════════════════════════════════
// Program Schedule Slots
// ═══════════════════════════════════════════════════════════

async function listProgramScheduleSlots(config, presetId) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_schedule_slots?preset_id=eq.${encodeURIComponent(presetId)}&order=sort_order.asc,day_of_week.asc,time_slot.asc`
  });
}

async function upsertProgramScheduleSlots(config, slots) {
  if (!slots.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: 'program_schedule_slots?on_conflict=preset_id,week_number,day_of_week,time_slot',
    method: 'POST',
    body: slots,
    prefer: 'return=representation,resolution=merge-duplicates'
  });
}

async function deleteProgramScheduleSlots(config, presetId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_schedule_slots?preset_id=eq.${encodeURIComponent(presetId)}`,
    method: 'DELETE'
  });
  return Array.isArray(rows) ? rows.length : 0;
}

// ═══════════════════════════════════════════════════════════
// Athlete Weekly Plan
// ═══════════════════════════════════════════════════════════

async function listAthleteWeeklyPlan(config, { athleteId, programAssignmentId, weekNumber }) {
  let path = `athlete_weekly_plan?athlete_id=eq.${encodeURIComponent(athleteId)}`;
  if (programAssignmentId) {
    path += `&program_assignment_id=eq.${encodeURIComponent(programAssignmentId)}`;
  }
  if (weekNumber != null) {
    path += `&week_number=eq.${encodeURIComponent(weekNumber)}`;
  }
  path += '&order=week_number.asc,day_of_week.asc,time_slot.asc';
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path
  });
}

async function insertAthleteWeeklyPlanRows(config, rows) {
  if (!rows.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: 'athlete_weekly_plan',
    method: 'POST',
    body: rows,
    prefer: 'return=representation'
  });
}

async function upsertAthleteWeeklyPlanRows(config, rows) {
  if (!rows.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: 'athlete_weekly_plan?on_conflict=athlete_id,program_assignment_id,week_number,day_of_week,time_slot',
    method: 'POST',
    body: rows,
    prefer: 'return=representation,resolution=merge-duplicates'
  });
}

async function updateAthleteWeeklyPlanRow(config, rowId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_weekly_plan?id=eq.${encodeURIComponent(rowId)}`,
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation'
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function deleteAthleteWeeklyPlan(config, programAssignmentId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_weekly_plan?program_assignment_id=eq.${encodeURIComponent(programAssignmentId)}`,
    method: 'DELETE'
  });
  return Array.isArray(rows) ? rows.length : 0;
}

async function markWeeklyPlanSlotCompleted(config, { athleteId, strengthInstanceId, weekNumber, dayNumber }) {
  const path = `athlete_weekly_plan?athlete_id=eq.${encodeURIComponent(athleteId)}&strength_instance_id=eq.${encodeURIComponent(strengthInstanceId)}&week_number=eq.${encodeURIComponent(weekNumber)}&strength_day_number=eq.${encodeURIComponent(dayNumber)}&status=eq.planned`;
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path,
    method: 'PATCH',
    body: { status: 'completed' },
    prefer: 'return=representation'
  });
  return Array.isArray(rows) ? rows : [];
}

/**
 * Find planned running slots in athlete_weekly_plan for a specific date.
 * Returns rows with session_type='running' and status='planned' that fall on the given ISO date.
 */
async function findPlannedRunningSlotsForDate(config, athleteId, isoDate) {
  // Derive week_start_date (Monday) and day_of_week (0=Mon..6=Sun) from the date
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return [];
  const jsDay = date.getUTCDay(); // 0=Sun
  const isoDayOfWeek = (jsDay + 6) % 7; // 0=Mon..6=Sun
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - isoDayOfWeek);
  const weekStartDate = monday.toISOString().slice(0, 10);

  const path = `athlete_weekly_plan?athlete_id=eq.${encodeURIComponent(athleteId)}`
    + `&session_type=eq.running`
    + `&status=eq.planned`
    + `&week_start_date=eq.${weekStartDate}`
    + `&day_of_week=eq.${isoDayOfWeek}`
    + `&order=time_slot.asc`;

  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path
  });
}

/**
 * Mark a running weekly plan slot as completed and store match metadata.
 */
async function markRunningPlanSlotCompleted(config, slotId, matchData) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_weekly_plan?id=eq.${encodeURIComponent(slotId)}`,
    method: 'PATCH',
    body: {
      status: 'completed',
      running_session_data: matchData || null
    },
    prefer: 'return=representation'
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}


// -- Central Leads -------------------------------------------------------------

async function upsertCentralLead(config, {
  athleteId,
  identityId,
  metaLeadId,
  source,
  sourceRefId,
  email,
  phone,
  fullName,
  funnelStage,
  leadStatus,
  lastActivityAt,
  lastActivityType,
  profile,
  rawPayload
} = {}) {
  function normalizeEmail(v) {
    return typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null;
  }
  function normalizePhone(v) {
    if (typeof v !== 'string') return null;
    const t = v.replace(/(?!^)\+/g, '').replace(/[^\d+]/g, '').trim();
    return t || null;
  }

  const emailNorm = normalizeEmail(email);
  const phoneNorm = normalizePhone(phone);
  const now = lastActivityAt || new Date().toISOString();

  // Try to find existing row
  let existing = null;
  if (identityId) {
    const rows = await supabaseRequest({
      url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey,
      path: `leads_central?identity_id=eq.${encodeURIComponent(identityId)}&limit=1`
    });
    existing = Array.isArray(rows) ? rows[0] || null : null;
  }
  if (!existing && emailNorm) {
    const rows = await supabaseRequest({
      url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey,
      path: `leads_central?email_normalized=eq.${encodeURIComponent(emailNorm)}&limit=1`
    });
    existing = Array.isArray(rows) ? rows[0] || null : null;
  }

  const funnelRank = { landing: 0, landing_submitted: 1, onboarding_submitted: 2, plan_generated: 3 };
  const existingRank = funnelRank[existing && existing.funnel_stage] || 0;
  const incomingRank = funnelRank[funnelStage] || 0;
  const resolvedFunnelStage = incomingRank >= existingRank
    ? (funnelStage || (existing && existing.funnel_stage) || null)
    : (existing && existing.funnel_stage);

  const row = {
    ...(athleteId ? { athlete_id: athleteId } : {}),
    ...(identityId ? { identity_id: identityId } : {}),
    ...(metaLeadId ? { meta_lead_id: metaLeadId } : {}),
    ...(source ? { source, last_source: source } : {}),
    ...(sourceRefId ? { source_ref_id: sourceRefId } : {}),
    ...(email ? { email } : {}),
    ...(emailNorm ? { email_normalized: emailNorm } : {}),
    ...(phone ? { phone } : {}),
    ...(phoneNorm ? { phone_normalized: phoneNorm } : {}),
    ...(fullName ? { full_name: fullName } : {}),
    ...(resolvedFunnelStage ? { funnel_stage: resolvedFunnelStage } : {}),
    ...(leadStatus ? { lead_status: leadStatus } : {}),
    last_activity_at: now,
    ...(lastActivityType ? { last_activity_type: lastActivityType } : {}),
    ...(profile && typeof profile === 'object' ? { profile } : {}),
    ...(rawPayload && typeof rawPayload === 'object' ? { raw_payload: rawPayload } : {}),
    updated_at: now
  };

  if (existing) {
    const updated = await supabaseRequest({
      url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey,
      path: `leads_central?id=eq.${encodeURIComponent(existing.id)}`,
      method: 'PATCH',
      body: row,
      prefer: 'return=representation'
    });
    return Array.isArray(updated) ? updated[0] || null : null;
  }

  const inserted = await supabaseRequest({
    url: config.supabaseUrl, serviceRoleKey: config.supabaseServiceRoleKey,
    path: 'leads_central',
    method: 'POST',
    body: [{ ...row, created_at: now }],
    prefer: 'return=representation'
  });
  return Array.isArray(inserted) ? inserted[0] || null : null;
}

// ── Payment Plans & Charges (phased payments) ─────────────────────────────

async function createPaymentPlan(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "payment_plans",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getPaymentPlanById(config, planId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `payment_plans?id=eq.${encodeURIComponent(planId)}&select=*&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updatePaymentPlan(config, planId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `payment_plans?id=eq.${encodeURIComponent(planId)}`,
    method: "PATCH",
    body: { ...patch, updated_at: new Date().toISOString() },
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listPaymentPlans(config, { identityId, programId, status, limit, offset } = {}) {
  const filters = ["select=*,training_programs(name)"];
  if (identityId) filters.push(`identity_id=eq.${encodeURIComponent(identityId)}`);
  if (programId) filters.push(`program_id=eq.${encodeURIComponent(programId)}`);
  if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
  filters.push("order=created_at.desc");
  if (Number.isFinite(limit) && limit > 0) filters.push(`limit=${limit}`);
  if (Number.isFinite(offset) && offset > 0) filters.push(`offset=${offset}`);
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `payment_plans?${filters.join("&")}`
  });
  return Array.isArray(rows) ? rows : [];
}

async function createPaymentCharges(config, charges) {
  if (!Array.isArray(charges) || !charges.length) return [];
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "payment_charges",
    method: "POST",
    body: charges,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows : [];
}

async function getPaymentChargeById(config, chargeId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `payment_charges?id=eq.${encodeURIComponent(chargeId)}&select=*,payment_plans(identity_id,program_id,status)&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updatePaymentCharge(config, chargeId, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `payment_charges?id=eq.${encodeURIComponent(chargeId)}`,
    method: "PATCH",
    body: { ...patch, updated_at: new Date().toISOString() },
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listPaymentCharges(config, { paymentPlanId, status, dueDateFrom, dueDateTo, limit, offset } = {}) {
  const filters = ["select=*,payment_plans(identity_id,program_id,currency,status,training_programs(name))"];
  if (paymentPlanId) filters.push(`payment_plan_id=eq.${encodeURIComponent(paymentPlanId)}`);
  if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
  if (dueDateFrom) filters.push(`due_date=gte.${encodeURIComponent(dueDateFrom)}`);
  if (dueDateTo) filters.push(`due_date=lte.${encodeURIComponent(dueDateTo)}`);
  filters.push("order=due_date.asc,charge_number.asc");
  if (Number.isFinite(limit) && limit > 0) filters.push(`limit=${limit}`);
  if (Number.isFinite(offset) && offset > 0) filters.push(`offset=${offset}`);
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `payment_charges?${filters.join("&")}`
  });
  return Array.isArray(rows) ? rows : [];
}

async function listDuePaymentCharges(config, { beforeDate, statuses } = {}) {
  const statusList = Array.isArray(statuses) && statuses.length
    ? statuses.map((s) => `"${s}"`).join(",")
    : '"pending","failed","overdue"';
  const dueFilter = beforeDate
    ? `due_date=lte.${encodeURIComponent(beforeDate)}`
    : `due_date=lte.${new Date().toISOString().slice(0, 10)}`;
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `payment_charges?status=in.(${statusList})&${dueFilter}&select=*,payment_plans(identity_id,program_id,currency,grace_period_days,max_retry_attempts,status,stripe_purchase_id)&order=due_date.asc&limit=200`
  });
  return Array.isArray(rows) ? rows : [];
}

async function getPaymentChargeByStripePI(config, paymentIntentId) {
  if (!paymentIntentId) return null;
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `payment_charges?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&select=*,payment_plans(identity_id,program_id,status)&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getPaymentPlanCharges(config, planId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `payment_charges?payment_plan_id=eq.${encodeURIComponent(planId)}&select=*&order=charge_number.asc`
  });
  return Array.isArray(rows) ? rows : [];
}

async function listAllPaymentChargesAdmin(config, { status, dueDateFrom, dueDateTo, email, programId, limit, offset } = {}) {
  const filters = ["select=*,payment_plans!inner(identity_id,program_id,currency,status,training_programs(name))"];
  if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
  if (dueDateFrom) filters.push(`due_date=gte.${encodeURIComponent(dueDateFrom)}`);
  if (dueDateTo) filters.push(`due_date=lte.${encodeURIComponent(dueDateTo)}`);
  if (programId) filters.push(`payment_plans.program_id=eq.${encodeURIComponent(programId)}`);
  filters.push("order=due_date.desc,charge_number.asc");
  if (Number.isFinite(limit) && limit > 0) filters.push(`limit=${limit}`);
  if (Number.isFinite(offset) && offset > 0) filters.push(`offset=${offset}`);
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `payment_charges?${filters.join("&")}`
  });
  return Array.isArray(rows) ? rows : [];
}

module.exports = {
  insertTrainingSessions,
  upsertTrainingSessionsBySource,
  findExistingSessions,
  updateSessionResults,
  getLatestUploadBatchId,
  deleteTrainingSessionsByBatch,
  deleteWeeklyCheckinsByBatch,
  getAthleteById,
  getAthleteByIdentity,
  getAthleteByEmail,
  getStravaConnectionByAthleteId,
  getStravaConnectionByStravaAthleteId,
  upsertStravaConnection,
  updateStravaConnection,
  createStravaSyncEvent,
  deleteTrainingSessionBySourceId,
  patchSessionTSS,
  listAthletes,
  createAthlete,
  upsertAthleteByIdentity,
  listAthletesByCoach,
  createAthleteForCoach,
  verifyCoachOwnsAthlete,
  listAthleteTrainingZoneProfiles,
  upsertAthleteTrainingZoneProfile,
  replaceAthleteTrainingZones,
  listUnassignedAthletes,
  assignUnassignedAthleteToCoach,
  setAthleteCoachIdentity,
  archiveAthlete,
  getPayingStatusForAthletes,
  getLatestPurchaseStatusForAthletes,
  getUserRoleNames,
  listCoaches,
  getCoachByIdentityId,
  createCoach,
  updateCoach,
  createAuthUser,
  inviteAuthUser,
  getAuthUserByEmail,
  assignRoleToIdentity,
  listTrainingPrograms,
  listTrainingEvents,
  getTrainingEventById,
  createTrainingEvent,
  updateTrainingEvent,
  createTrainingProgram,
  updateTrainingProgram,
  getTrainingProgramById,
  getTrainingProgramByExternalId,
  listPublicTrainingPrograms,
  createProgramAssignment,
  getCurrentProgramAssignment,
  getProgramAssignmentById,
  getActiveLikeProgramAssignment,
  getLatestCancellableProgramAssignment,
  updateProgramAssignment,
  setAssignmentPreset,
  listAssignmentHistory,
  listAllAthletesForAdmin,
  listActiveAssignmentsWithPrograms,
  listEnrichedAssignments,
  createStripePurchase,
  upsertStripePurchaseBySessionId,
  updateStripePurchaseById,
  getStripePurchaseBySessionId,
  getStripePurchaseBySubscriptionId,
  getStripePurchaseByPaymentIntentId,
  getActiveStripePurchaseForIdentity,
  updateStripePurchasesBySubscriptionId,
  updateStripePurchasesByPaymentIntentId,
  upsertStripePurchaseByPaymentIntentId,
  listStripePurchases,
  createPaymentPlan,
  getPaymentPlanById,
  updatePaymentPlan,
  listPaymentPlans,
  createPaymentCharges,
  getPaymentChargeById,
  updatePaymentCharge,
  listPaymentCharges,
  listDuePaymentCharges,
  getPaymentChargeByStripePI,
  getPaymentPlanCharges,
  listAllPaymentChargesAdmin,
  listSiteMetadata,
  listSiteMetrics,
  listSiteReviews,
  listSiteLinks,
  replaceSiteMetadata,
  replaceSiteMetrics,
  replaceSiteReviews,
  replaceSiteLinks,
  listSiteFaqs,
  replaceSiteFaqs,
  getWeekSessions,
  listTrainingSessionsForAthlete,
  replaceTrainingLoadDaily,
  replaceTrainingLoadMetrics,
  getLatestTrainingLoadMetric,
  getTrainingLoadDailyRange,
  getTrainingLoadMetricsRange,
  createWeeklyCheckin,
  getWeeklyCheckinByToken,
  getWeeklyCheckinById,
  getWeeklyCheckinByBatch,
  listWeeklyCheckinsByAthlete,
  listWeeklyCheckinsByAthleteIds,
  getWeeklyCheckinDetail,
  updateWeeklyCheckin,
  listPublishedBlogArticles,
  getPublishedBlogArticleBySlug,
  getBlogArticleById,
  getBlogArticleBySlugAny,
  listBlogArticlesAdmin,
  listBlogCategories,
  getBlogCategoryById,
  getBlogCategoryByName,
  createBlogArticle,
  createBlogCategory,
  updateBlogArticle,
  updateBlogCategory,
  softDeleteBlogArticle,
  archiveDeletedBlogArticleSlug,
  reassignBlogArticlesCategory,
  getBlogContentProductionByArticle,
  upsertBlogContentProduction,
  updateBlogContentProductionByArticle,
  getBlogContentProductionById,
  updateBlogContentProductionById,
  insertBlogContentProduction,
  listStandaloneProductions,
  insertMetaLead,
  listMetaLeads,
  updateMetaLead,
  listAiPrompts,
  getAiPromptById,
  getActiveAiPrompt,
  createAiPrompt,
  updateAiPrompt,
  createAiPromptVersion,
  listAiPromptVersions,
  insertAiLog,
  listAiLogs,
  // Strength Training
  listExercises,
  getExercisesByIds,
  createExercise,
  updateExercise,
  listStrengthPlans,
  listStrengthPlanInstances,
  getActiveInstanceForAthlete,
  getStrengthInstanceByStripePurchaseId,
  createStrengthPlanInstance,
  updateStrengthPlanInstance,
  getStrengthPlanInstanceById,
  getStrengthPlanById,
  getStrengthPlanFull,
  listStrengthPlanDayLabels,
  upsertStrengthPlanDayLabels,
  deleteStrengthPlanDayLabelsByDays,
  createStrengthPlan,
  updateStrengthPlan,
  listStrengthWarmupPresets,
  createStrengthWarmupPreset,
  updateStrengthWarmupPreset,
  deleteStrengthWarmupPreset,
  upsertStrengthPlanExercises,
  deleteStrengthPlanExercises,
  getStrengthPlanExercisesByIds,
  upsertStrengthPrescriptions,
  upsertStrengthPlanPhaseNotes,
  getAthlete1rms,
  getAthlete1rmLatest,
  get1rmHistory,
  insertAthlete1rm,
  insertStrengthLogSets,
  getStrengthLogs,
  getStrengthLogsByDateRange,
  createStrengthLogSession,
  updateStrengthLogSession,
  getStrengthLogSession,
  findActiveStrengthSession,
  getInProgressStrengthSessionForInstanceOnDate,
  cancelOrphanedSessions,
  getStrengthSessionHistory,
  getStrengthLogSetsForSessions,
  getOnboardingIntakeByIdentity,
  getOnboardingFormResponsesByIdentity,
  getStripePurchasesForIdentity,
  getAllInstancesForAthlete,
  getActiveAssignmentsForAthlete,
  getStripePurchasesBySubscriptionId,
  pauseInstancesByStripeSubscription,
  resumeInstancesByStripeSubscription,
  updateAthlete,
  // Program Schedule
  listProgramWeeklySessions,
  upsertProgramWeeklySessions,
  deleteProgramWeeklySessions,
  listProgramSchedulePresets,
  getProgramSchedulePresetById,
  createProgramSchedulePreset,
  updateProgramSchedulePreset,
  deleteProgramSchedulePreset,
  listProgramScheduleSlots,
  upsertProgramScheduleSlots,
  deleteProgramScheduleSlots,
  listAthleteWeeklyPlan,
  insertAthleteWeeklyPlanRows,
  upsertAthleteWeeklyPlanRows,
  updateAthleteWeeklyPlanRow,
  deleteAthleteWeeklyPlan,
  markWeeklyPlanSlotCompleted,
  findPlannedRunningSlotsForDate,
  markRunningPlanSlotCompleted,
  upsertCentralLead,
};


