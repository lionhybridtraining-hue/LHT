const { json } = require("./http");
const { getAuthenticatedUser } = require("./auth-supabase");
const { getUserRoleNames } = require("./supabase");

function getMaxSessionSeconds() {
  const fallback = 24 * 60 * 60;
  const raw = Number(process.env.AUTH_MAX_SESSION_SECONDS || fallback);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

function isSessionWithinMaxAge(user) {
  if (!user?.iat) return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const age = nowSeconds - Number(user.iat);
  return age >= 0 && age <= getMaxSessionSeconds();
}

async function requireAuthenticatedUser(event, config) {
  const user = await getAuthenticatedUser(event, config);
  if (!user) {
    return {
      user: null,
      roles: [],
      error: json(401, { error: "Authentication required" })
    };
  }

  if (!isSessionWithinMaxAge(user)) {
    return {
      user: null,
      roles: [],
      error: json(401, { error: "Session expired" })
    };
  }

  const roles = await getUserRoleNames(config, user.sub);
  return { user, roles, error: null };
}

async function requireRole(event, config, requiredRole) {
  const auth = await requireAuthenticatedUser(event, config);
  if (auth.error) return auth;

  if (!auth.roles.includes(requiredRole)) {
    return {
      ...auth,
      error: json(403, { error: "Forbidden" })
    };
  }

  return auth;
}

module.exports = {
  requireAuthenticatedUser,
  requireRole
};
