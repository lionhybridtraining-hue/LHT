const { json } = require("./http");
const { getAuthenticatedUser } = require("./auth-supabase");
const { getUserRoleNames } = require("./supabase");

function parseCsvEnv(name) {
  const raw = process.env[name] || "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

function hasMatch(values, candidate) {
  if (!candidate) return false;
  return values.includes(String(candidate).trim().toLowerCase());
}

function applyRoleAllowlists(user, roles) {
  const nextRoles = Array.isArray(roles) ? [...roles] : [];
  const identityId = user && user.sub ? user.sub : "";
  const email = user && user.email ? user.email : "";

  const adminIds = parseCsvEnv("AUTH_ADMIN_ALLOWLIST_IDS");
  const adminEmails = parseCsvEnv("AUTH_ADMIN_ALLOWLIST_EMAILS");
  if (hasMatch(adminIds, identityId) || hasMatch(adminEmails, email)) {
    nextRoles.push("admin");
  }

  const coachIds = parseCsvEnv("AUTH_COACH_ALLOWLIST_IDS");
  const coachEmails = parseCsvEnv("AUTH_COACH_ALLOWLIST_EMAILS");
  if (hasMatch(coachIds, identityId) || hasMatch(coachEmails, email)) {
    nextRoles.push("coach");
  }

  return Array.from(new Set(nextRoles));
}

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

  const explicitRoles = await getUserRoleNames(config, user.sub);
  const roles = applyRoleAllowlists(user, explicitRoles);
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
