const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const {
  getAthleteByIdentity,
  upsertAthleteByIdentity,
  getStravaConnectionByAthleteId
} = require("./_lib/supabase");

async function ensureAthlete(config, user) {
  const existing = await getAthleteByIdentity(config, user.sub);
  if (existing) return existing;

  return upsertAthleteByIdentity(config, {
    identityId: user.sub,
    email: user.email,
    name: user.email
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
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
      return json(200, {
        connected: false,
        athleteId: athlete.id
      });
    }

    return json(200, {
      connected: true,
      athleteId: athlete.id,
      stravaAthleteId: connection.strava_athlete_id,
      scope: connection.scope,
      tokenExpiresAt: connection.token_expires_at,
      lastSyncAt: connection.last_sync_at
    });
  } catch (error) {
    return json(error.status || 500, { error: error.message || "Failed to load Strava status" });
  }
};
