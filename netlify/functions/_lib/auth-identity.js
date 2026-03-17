function extractBearerToken(event) {
  const headers = event && event.headers ? event.headers : {};
  const authHeader = headers.authorization || headers.Authorization || "";
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function resolveSiteOrigin(event, config) {
  const headers = event && event.headers ? event.headers : {};
  const host = headers["x-forwarded-host"] || headers.host;
  const protocol = headers["x-forwarded-proto"] || "https";

  if (host) {
    return `${protocol}://${host}`;
  }

  return config.siteUrl || "https://lionhybridtraining.com";
}

async function getIdentityUserFromToken(event, config) {
  const token = extractBearerToken(event);
  if (!token) return null;

  try {
    const origin = resolveSiteOrigin(event, config);
    const response = await fetch(`${origin}/.netlify/identity/user`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

async function getAuthenticatedUser(event, config) {
  if (event && event.clientContext && event.clientContext.user) {
    return event.clientContext.user;
  }

  return getIdentityUserFromToken(event, config);
}

module.exports = {
  extractBearerToken,
  resolveSiteOrigin,
  getIdentityUserFromToken,
  getAuthenticatedUser
};
