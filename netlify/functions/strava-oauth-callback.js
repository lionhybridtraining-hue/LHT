const { getConfig } = require("./_lib/config");
const {
  getAthleteById,
  upsertStravaConnection,
  createStravaSyncEvent
} = require("./_lib/supabase");
const { parseSignedState, exchangeCodeForToken } = require("./_lib/strava");

function redirect(url) {
  return {
    statusCode: 302,
    headers: {
      Location: url,
      "Cache-Control": "no-store"
    },
    body: ""
  };
}

function getFailUrl(config, reason) {
  const base = config.siteUrl.replace(/\/$/, "");
  return `${base}/atleta/perfil?strava=error&reason=${encodeURIComponent(reason)}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const config = getConfig();

  try {
    const params = event.queryStringParameters || {};
    if (params.error) {
      return redirect(getFailUrl(config, params.error));
    }

    const code = params.code;
    const state = params.state;
    if (!code || !state) {
      return redirect(getFailUrl(config, "missing_code_or_state"));
    }

    const statePayload = parseSignedState(config, state);
    if (!statePayload.athleteId || !statePayload.identityId) {
      return redirect(getFailUrl(config, "invalid_state_payload"));
    }

    const athlete = await getAthleteById(config, statePayload.athleteId);
    if (!athlete || athlete.identity_id !== statePayload.identityId) {
      return redirect(getFailUrl(config, "athlete_not_authorized"));
    }

    const tokenPayload = await exchangeCodeForToken(config, { code });
    const expiresAtSeconds = Number(tokenPayload.expires_at);
    const tokenExpiresAt = Number.isFinite(expiresAtSeconds)
      ? new Date(expiresAtSeconds * 1000).toISOString()
      : new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

    await upsertStravaConnection(config, {
      athlete_id: athlete.id,
      strava_athlete_id: tokenPayload.athlete && tokenPayload.athlete.id ? tokenPayload.athlete.id : null,
      strava_athlete_username: tokenPayload.athlete && tokenPayload.athlete.username ? tokenPayload.athlete.username : null,
      strava_athlete_firstname: tokenPayload.athlete && tokenPayload.athlete.firstname ? tokenPayload.athlete.firstname : null,
      strava_athlete_lastname: tokenPayload.athlete && tokenPayload.athlete.lastname ? tokenPayload.athlete.lastname : null,
      scope: tokenPayload.scope || null,
      access_token: tokenPayload.access_token,
      refresh_token: tokenPayload.refresh_token,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString()
    });

    await createStravaSyncEvent(config, {
      athlete_id: athlete.id,
      event_type: "oauth_connected",
      source: "oauth_callback",
      payload: {
        stravaAthleteId: tokenPayload.athlete && tokenPayload.athlete.id ? tokenPayload.athlete.id : null,
        scope: tokenPayload.scope || null
      }
    });

    const base = config.siteUrl.replace(/\/$/, "");
    return redirect(`${base}/atleta/perfil?strava=connected`);
  } catch (error) {
    console.error("strava-oauth-callback error:", error.message);
    return redirect(getFailUrl(config, "oauth_callback_failed"));
  }
};
