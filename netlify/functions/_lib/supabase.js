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

async function getBlogContentProductionByArticle(config, articleId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `blog_content_production?article_id=eq.${encodeURIComponent(articleId)}&select=*&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function upsertBlogContentProduction(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "blog_content_production?on_conflict=article_id",
    method: "POST",
    body: [payload],
    prefer: "return=representation,resolution=merge-duplicates"
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
    path: `blog_content_production?article_id=is.null&select=id,status,briefing_data,whatsapp_variants,selected_variant,generation_mode,extra_instructions,manual_shared_at,updated_at,created_at&order=updated_at.desc&limit=${limit || 20}`
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
  const now = new Date().toISOString();
  const inList = validIds.map((id) => encodeURIComponent(id)).join(",");
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?identity_id=in.(${inList})&status=eq.paid&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(now)})&select=identity_id,status,billing_type,program_id,expires_at,paid_at&order=paid_at.desc.nullslast`
  });
  const map = {};
  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      if (row.identity_id && !map[row.identity_id]) {
        map[row.identity_id] = {
          isPaying: true,
          billingType: row.billing_type || "one_time",
          programId: row.program_id || null,
          paidAt: row.paid_at || null,
          expiresAt: row.expires_at || null
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

async function listTrainingPrograms(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "training_programs?deleted_at=is.null&select=id,external_source,external_id,name,description,duration_weeks,price_cents,currency,stripe_product_id,stripe_price_id,billing_type,status,created_at,updated_at&order=created_at.desc"
  });
}

async function createTrainingProgram(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "training_programs",
    method: "POST",
    body: [payload],
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateTrainingProgram(config, id, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_programs?id=eq.${encodeURIComponent(id)}`,
    method: "PATCH",
    body: patch,
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getTrainingProgramById(config, id) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_programs?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=id,external_source,external_id,name,description,duration_weeks,price_cents,currency,status,stripe_product_id,stripe_price_id,billing_type,created_at,updated_at&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getTrainingProgramByExternalId(config, externalId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_programs?external_id=eq.${encodeURIComponent(externalId)}&deleted_at=is.null&select=id,external_source,external_id,name,description,duration_weeks,price_cents,currency,status,stripe_product_id,stripe_price_id,billing_type,created_at,updated_at&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listPublicTrainingPrograms(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "training_programs?deleted_at=is.null&status=eq.active&select=id,external_id,name,description,duration_weeks,price_cents,currency,billing_type,created_at,updated_at&order=price_cents.asc,created_at.asc"
  });
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
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?identity_id=eq.${encodeURIComponent(identityId)}&program_id=eq.${encodeURIComponent(programId)}&status=eq.paid&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(comparisonTime)})&select=*&order=paid_at.desc.nullslast,created_at.desc&limit=1`
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
  const params = ['select=id,name,description,total_weeks,load_round,start_date,status,training_program_id,created_by,created_at,updated_at', 'order=created_at.desc'];
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
  const params = ['select=*,plan:strength_plans(id,name,total_weeks,load_round,training_program_id,status)', 'order=created_at.desc'];
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
    path: `strength_plan_instances?athlete_id=eq.${encodeURIComponent(athleteId)}&status=eq.active&select=*,plan:strength_plans(*)&limit=1`
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

async function getStrengthPlanFull(config, planId) {
  const plan = await getStrengthPlanById(config, planId);
  if (!plan) return null;

  const exercises = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_exercises?plan_id=eq.${encodeURIComponent(planId)}&select=*,exercise:exercises(id,name,category,subcategory,video_url,description,default_weight_per_side,default_each_side,default_tempo)&order=day_number.asc,exercise_order.asc`
  });

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

  return { plan, exercises: exercises || [], prescriptions: prescriptions || [], phaseNotes: phaseNotes || [] };
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
    path: "strength_prescriptions",
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
    path: "strength_plan_phase_notes",
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

module.exports = {
  insertTrainingSessions,
  findExistingSessions,
  updateSessionResults,
  getLatestUploadBatchId,
  deleteTrainingSessionsByBatch,
  deleteWeeklyCheckinsByBatch,
  getAthleteById,
  getAthleteByIdentity,
  getAthleteByEmail,
  listAthletes,
  createAthlete,
  upsertAthleteByIdentity,
  listAthletesByCoach,
  createAthleteForCoach,
  verifyCoachOwnsAthlete,
  listUnassignedAthletes,
  assignUnassignedAthleteToCoach,
  getPayingStatusForAthletes,
  getUserRoleNames,
  listCoaches,
  createCoach,
  assignRoleToIdentity,
  listTrainingPrograms,
  createTrainingProgram,
  updateTrainingProgram,
  getTrainingProgramById,
  getTrainingProgramByExternalId,
  listPublicTrainingPrograms,
  createProgramAssignment,
  createStripePurchase,
  upsertStripePurchaseBySessionId,
  updateStripePurchaseById,
  getStripePurchaseBySessionId,
  getStripePurchaseBySubscriptionId,
  getStripePurchaseByPaymentIntentId,
  getActiveStripePurchaseForIdentity,
  updateStripePurchasesBySubscriptionId,
  updateStripePurchasesByPaymentIntentId,
  listStripePurchases,
  listSiteMetadata,
  listSiteMetrics,
  listSiteReviews,
  listSiteLinks,
  replaceSiteMetadata,
  replaceSiteMetrics,
  replaceSiteReviews,
  replaceSiteLinks,
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
  getWeeklyCheckinDetail,
  updateWeeklyCheckin,
  listPublishedBlogArticles,
  getPublishedBlogArticleBySlug,
  getBlogArticleById,
  listBlogArticlesAdmin,
  createBlogArticle,
  updateBlogArticle,
  softDeleteBlogArticle,
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
  createExercise,
  updateExercise,
  listStrengthPlans,
  listStrengthPlanInstances,
  getActiveInstanceForAthlete,
  createStrengthPlanInstance,
  updateStrengthPlanInstance,
  getStrengthPlanInstanceById,
  getStrengthPlanById,
  getStrengthPlanFull,
  createStrengthPlan,
  updateStrengthPlan,
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
  getStrengthLogsByDateRange
};
