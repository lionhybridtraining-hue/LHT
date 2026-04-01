const { json } = require('./_lib/http');
const { getConfig } = require('./_lib/config');
const {
  getStravaConnectionByStravaAthleteId,
  updateStravaConnection,
  upsertTrainingSessionsBySource,
  listTrainingSessionsForAthlete,
  replaceTrainingLoadDaily,
  replaceTrainingLoadMetrics,
  createStravaSyncEvent,
  deleteTrainingSessionBySourceId,
} = require('./_lib/supabase');
const { refreshAccessToken, stravaRequest, mapStravaActivityToSession } = require('./_lib/strava');
const {
  aggregateTrainingLoadDaily,
  calculateTrainingLoadMetrics,
} = require('./_lib/training-load');

async function ensureValidAccessToken(config, connection) {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const now = Date.now();

  if (!Number.isFinite(expiresAt) || expiresAt - now > 60 * 1000) {
    return {
      accessToken: connection.access_token,
      refreshToken: connection.refresh_token,
      tokenExpiresAt: connection.token_expires_at,
      refreshed: false,
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
    raw: refreshedToken,
  };
}

function parseJsonBody(event) {
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : event.body || '';
    return body ? JSON.parse(body) : {};
  } catch {
    throw new Error('Invalid JSON body');
  }
}

async function recalculateTrainingLoad(config, athleteId) {
  const allSessions = await listTrainingSessionsForAthlete(config, athleteId);
  const dailyLoadRows = aggregateTrainingLoadDaily(athleteId, Array.isArray(allSessions) ? allSessions : []);
  const metricsRows = calculateTrainingLoadMetrics(athleteId, dailyLoadRows);
  await replaceTrainingLoadDaily(config, athleteId, dailyLoadRows);
  await replaceTrainingLoadMetrics(config, athleteId, metricsRows);
}

exports.handler = async (event) => {
  const config = getConfig();

  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const mode = params['hub.mode'];
    const verifyToken = params['hub.verify_token'];
    const challenge = params['hub.challenge'];

    if (!config.stravaWebhookVerifyToken) {
      return { statusCode: 500, body: 'Missing STRAVA_WEBHOOK_VERIFY_TOKEN' };
    }

    if (mode === 'subscribe' && verifyToken === config.stravaWebhookVerifyToken) {
      return { statusCode: 200, body: challenge || '' };
    }

    return { statusCode: 403, body: 'Forbidden' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const payload = parseJsonBody(event);
    const ownerId = payload.owner_id;
    const objectType = payload.object_type;
    const aspectType = payload.aspect_type;
    const objectId = payload.object_id;

    if (!ownerId || !objectType || !aspectType) {
      return json(200, { received: true, ignored: true, reason: 'missing_required_fields' });
    }

    const connection = await getStravaConnectionByStravaAthleteId(config, ownerId);
    if (!connection) {
      return json(200, { received: true, ignored: true, reason: 'athlete_not_linked' });
    }

    const athleteId = connection.athlete_id;
    const token = await ensureValidAccessToken(config, connection);
    const nowIso = new Date().toISOString();

    let upsertedCount = 0;
    let deletedCount = 0;

    if (objectType === 'activity' && (aspectType === 'create' || aspectType === 'update')) {
      const activity = await stravaRequest(`/activities/${encodeURIComponent(objectId)}`, token.accessToken);
      const session = mapStravaActivityToSession(activity, athleteId);
      if (session) {
        const upserted = await upsertTrainingSessionsBySource(config, [session]);
        upsertedCount = Array.isArray(upserted) ? upserted.length : 0;
      }
      await recalculateTrainingLoad(config, athleteId);
    }

    if (objectType === 'activity' && aspectType === 'delete') {
      deletedCount = await deleteTrainingSessionBySourceId(config, athleteId, 'strava', String(objectId));
      await recalculateTrainingLoad(config, athleteId);
    }

    const patch = {
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      token_expires_at: token.tokenExpiresAt,
      last_sync_at: nowIso,
      updated_at: nowIso,
    };

    if (token.raw && token.raw.scope) {
      patch.scope = token.raw.scope;
    }

    await updateStravaConnection(config, athleteId, patch);

    await createStravaSyncEvent(config, {
      athlete_id: athleteId,
      event_type: `webhook_${aspectType}`,
      source: 'strava-webhook',
      payload: {
        objectType,
        aspectType,
        objectId,
        ownerId,
        upsertedCount,
        deletedCount,
        tokenRefreshed: token.refreshed,
      },
    });

    return json(200, {
      received: true,
      athleteId,
      objectType,
      aspectType,
      objectId,
      upsertedCount,
      deletedCount,
    });
  } catch (error) {
    console.error('strava-webhook error:', error.message);
    return json(500, { error: error.message || 'Webhook processing failed' });
  }
};
