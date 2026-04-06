const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  getAthleteByIdentity,
  upsertAthleteByIdentity,
  getStravaConnectionByAthleteId,
  updateStravaConnection,
  upsertTrainingSessionsBySource,
  patchSessionTSS,
  listTrainingSessionsForAthlete,
  replaceTrainingLoadDaily,
  replaceTrainingLoadMetrics,
  createStravaSyncEvent
} = require("./_lib/supabase");
const {
  refreshAccessToken,
  stravaRequest,
  mapStravaActivityToSession
} = require("./_lib/strava");
const {
  aggregateTrainingLoadDaily,
  calculateTrainingLoadMetrics
} = require("./_lib/training-load");
const { enrichSessionsAfterSync } = require("./_lib/plan-adherence");

function toUnixSeconds(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1000);
}

async function ensureAthlete(config, user) {
  const existing = await getAthleteByIdentity(config, user.sub);
  if (existing) return existing;

  return upsertAthleteByIdentity(config, {
    identityId: user.sub,
    email: user.email,
    name: user.email
  });
}

async function ensureValidAccessToken(config, connection) {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const now = Date.now();

  if (!Number.isFinite(expiresAt) || expiresAt - now > 60 * 1000) {
    return {
      accessToken: connection.access_token,
      refreshToken: connection.refresh_token,
      tokenExpiresAt: connection.token_expires_at,
      refreshed: false
    };
  }

  const refreshedToken = await refreshAccessToken(config, connection.refresh_token);
  const nextExpiresAt = Number(refreshedToken.expires_at);
  const tokenExpiresAt = Number.isFinite(nextExpiresAt)
    ? new Date(nextExpiresAt * 1000).toISOString()
    : new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  return {
    accessToken: refreshedToken.access_token,
    refreshToken: refreshedToken.refresh_token,
    tokenExpiresAt,
    refreshed: true,
    raw: refreshedToken
  };
}

async function fetchActivities(accessToken, afterUnixSeconds) {
  const allActivities = [];
  const perPage = 100;

  for (let page = 1; page <= 20; page += 1) {
    const rows = await stravaRequest("/athlete/activities", accessToken, {
      per_page: perPage,
      page,
      after: afterUnixSeconds
    });

    const chunk = Array.isArray(rows) ? rows : [];
    allActivities.push(...chunk);

    if (chunk.length < perPage) {
      break;
    }
  }

  return allActivities;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const athlete = await ensureAthlete(config, auth.user);
    if (!athlete) {
      return json(500, { error: "Unable to resolve athlete profile" });
    }

    const connection = await getStravaConnectionByAthleteId(config, athlete.id);
    if (!connection) {
      return json(400, { error: "Strava account is not connected" });
    }

    const payload = parseJsonBody(event);
    const nowIso = new Date().toISOString();
    const defaultAfter = connection.last_sync_at
      ? Math.max(0, toUnixSeconds(connection.last_sync_at) - (7 * 24 * 60 * 60))
      : Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);
    const customAfter = Number(payload.afterUnixSeconds);
    const afterUnixSeconds = Number.isFinite(customAfter) && customAfter > 0
      ? Math.floor(customAfter)
      : defaultAfter;

    const token = await ensureValidAccessToken(config, connection);
    const activities = await fetchActivities(token.accessToken, afterUnixSeconds);

    const sessions = activities
      .map((activity) => mapStravaActivityToSession(activity, athlete.id))
      .filter(Boolean);

    const upserted = await upsertTrainingSessionsBySource(config, sessions);

    // Compute TSS backend + plan adherence for each synced session
    const { tssPatches, adherenceResults } = await enrichSessionsAfterSync(config, athlete.id, sessions);
    for (const p of tssPatches) {
      if (p.tss != null && p.source_session_id) {
        await patchSessionTSS(config, athlete.id, p.source_session_id, {
          tss: p.tss,
          intensityFactor: p.intensity_factor,
          tssMethod: p.tss_method
        });
      }
    }

    const patch = {
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      token_expires_at: token.tokenExpiresAt,
      last_sync_at: nowIso,
      updated_at: nowIso
    };

    if (token.raw && token.raw.scope) {
      patch.scope = token.raw.scope;
    }

    await updateStravaConnection(config, athlete.id, patch);

    const allSessions = await listTrainingSessionsForAthlete(config, athlete.id);
    const dailyLoadRows = aggregateTrainingLoadDaily(athlete.id, Array.isArray(allSessions) ? allSessions : []);
    const metricsRows = calculateTrainingLoadMetrics(athlete.id, dailyLoadRows);

    await replaceTrainingLoadDaily(config, athlete.id, dailyLoadRows);
    await replaceTrainingLoadMetrics(config, athlete.id, metricsRows);

    await createStravaSyncEvent(config, {
      athlete_id: athlete.id,
      event_type: "manual_sync",
      source: "strava-sync",
      payload: {
        activitiesFetched: activities.length,
        sessionsUpserted: Array.isArray(upserted) ? upserted.length : 0,
        tssComputed: tssPatches.filter((p) => p.tss != null).length,
        tssMethods: tssPatches.reduce((acc, p) => { acc[p.tss_method] = (acc[p.tss_method] || 0) + 1; return acc; }, {}),
        adherenceMatched: adherenceResults.filter((a) => a.matched).length,
        afterUnixSeconds,
        tokenRefreshed: token.refreshed
      }
    });

    return json(200, {
      athleteId: athlete.id,
      activitiesFetched: activities.length,
      sessionsUpserted: Array.isArray(upserted) ? upserted.length : 0,
      syncedAt: nowIso,
      tokenRefreshed: token.refreshed
    });
  } catch (error) {
    console.error("strava-sync error:", error.message);
    return json(error.status || 500, { error: error.message || "Failed to sync Strava activities" });
  }
};
