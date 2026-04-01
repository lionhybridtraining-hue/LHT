const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { getAthleteByIdentity, upsertAthleteByIdentity } = require("./_lib/supabase");
const { buildAuthorizeUrl } = require("./_lib/strava");

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

    const redirectPath = "/.netlify/functions/strava-oauth-callback";
    const oauth = buildAuthorizeUrl(config, {
      athleteId: athlete.id,
      identityId: auth.user.sub,
      redirectPath
    });

    return json(200, {
      authorizeUrl: oauth.url,
      redirectUri: oauth.redirectUri
    });
  } catch (error) {
    return json(error.status || 500, { error: error.message || "Failed to build Strava connect URL" });
  }
};
