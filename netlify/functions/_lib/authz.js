const { json } = require("./http");
const { getAuthenticatedUser } = require("./auth-supabase");
const { getUserRoleNames } = require("./supabase");

async function requireAuthenticatedUser(event, config) {
  const user = await getAuthenticatedUser(event, config);
  if (!user) {
    return {
      user: null,
      roles: [],
      error: json(401, { error: "Authentication required" })
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
