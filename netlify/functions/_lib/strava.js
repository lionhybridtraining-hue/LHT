const crypto = require("crypto");
const { normalizeSessionTitle } = require("./csv");

const STRAVA_BASE = "https://www.strava.com";
const API_BASE = "https://www.strava.com/api/v3";
const DEFAULT_SCOPES = ["read", "activity:read_all"];

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createStateSignature(payloadText, secret) {
  return crypto.createHmac("sha256", secret).update(payloadText).digest("base64url");
}

function getStateSecret(config) {
  const candidate = (config && config.stravaStateSecret) || (config && config.supabaseServiceRoleKey) || "";
  if (!candidate) {
    throw new Error("Missing STRAVA_STATE_SECRET");
  }
  return candidate;
}

function buildSignedState(config, payload) {
  const statePayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 15 * 60,
    nonce: crypto.randomUUID()
  };

  const payloadText = JSON.stringify(statePayload);
  const encodedPayload = base64UrlEncode(payloadText);
  const signature = createStateSignature(payloadText, getStateSecret(config));
  return `${encodedPayload}.${signature}`;
}

function parseSignedState(config, state) {
  if (typeof state !== "string" || !state.includes(".")) {
    throw new Error("Invalid OAuth state");
  }

  const [encodedPayload, receivedSignature] = state.split(".");
  const payloadText = base64UrlDecode(encodedPayload);
  const expectedSignature = createStateSignature(payloadText, getStateSecret(config));

  if (receivedSignature !== expectedSignature) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(payloadText);
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    throw new Error("OAuth state expired");
  }

  return payload;
}

function buildAuthorizeUrl(config, { athleteId, identityId, redirectPath }) {
  if (!config.stravaClientId) {
    throw new Error("Missing STRAVA_CLIENT_ID");
  }

  const redirectUri = `${config.siteUrl.replace(/\/$/, "")}${redirectPath || "/.netlify/functions/strava-oauth-callback"}`;
  const state = buildSignedState(config, {
    athleteId,
    identityId,
    redirectUri
  });

  const params = new URLSearchParams({
    client_id: String(config.stravaClientId),
    response_type: "code",
    redirect_uri: redirectUri,
    approval_prompt: "force",
    scope: DEFAULT_SCOPES.join(","),
    state
  });

  return {
    url: `${STRAVA_BASE}/oauth/authorize?${params.toString()}`,
    state,
    redirectUri
  };
}

async function exchangeCodeForToken(config, { code }) {
  if (!config.stravaClientId || !config.stravaClientSecret) {
    throw new Error("Missing Strava OAuth credentials");
  }

  const response = await fetch(`${STRAVA_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: Number(config.stravaClientId),
      client_secret: config.stravaClientSecret,
      code,
      grant_type: "authorization_code"
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && payload.message ? payload.message : `Strava token exchange failed (${response.status})`;
    throw new Error(detail);
  }

  return payload;
}

async function refreshAccessToken(config, refreshToken) {
  if (!config.stravaClientId || !config.stravaClientSecret) {
    throw new Error("Missing Strava OAuth credentials");
  }

  const response = await fetch(`${STRAVA_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: Number(config.stravaClientId),
      client_secret: config.stravaClientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && payload.message ? payload.message : `Strava token refresh failed (${response.status})`;
    throw new Error(detail);
  }

  return payload;
}

async function stravaRequest(path, accessToken, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  const url = `${API_BASE}${path}${query.toString() ? `?${query.toString()}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload && payload.message ? payload.message : `Strava API error (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function toIsoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toRoundedNumber(value, digits) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function mapStravaActivityToSession(activity, athleteId) {
  const sessionDate = toIsoDate(activity.start_date_local || activity.start_date);
  if (!sessionDate) return null;

  const movingSeconds = Number(activity.moving_time);
  const elapsedSeconds = Number(activity.elapsed_time);
  const distanceMeters = Number(activity.distance);

  const durationMinutes = Number.isFinite(movingSeconds)
    ? Math.round(movingSeconds / 60)
    : Number.isFinite(elapsedSeconds)
      ? Math.round(elapsedSeconds / 60)
      : null;

  const distanceKm = Number.isFinite(distanceMeters)
    ? toRoundedNumber(distanceMeters / 1000, 2)
    : null;

  const title = String(activity.name || "Strava Session").trim() || "Strava Session";
  const sportType = String(activity.sport_type || activity.type || "").trim();

  return {
    athlete_id: athleteId,
    source: "strava",
    source_session_id: activity.id ? String(activity.id) : null,
    source_payload: activity,
    session_date: sessionDate,
    title,
    sport_type: sportType,
    duration_minutes: durationMinutes,
    actual_duration_minutes: durationMinutes,
    actual_distance_meters: Number.isFinite(distanceMeters) ? distanceMeters : null,
    planned_duration_minutes: null,
    planned_distance_meters: null,
    tss: Number.isFinite(Number(activity.suffer_score)) ? Number(activity.suffer_score) : null,
    intensity_factor: null,
    ctl: null,
    atl: null,
    tsb: null,
    avg_heart_rate: Number.isFinite(Number(activity.average_heartrate)) ? Number(activity.average_heartrate) : null,
    avg_power: Number.isFinite(Number(activity.average_watts)) ? Number(activity.average_watts) : null,
    work_kj: Number.isFinite(Number(activity.kilojoules)) ? Number(activity.kilojoules) : null,
    distance_km: distanceKm,
    avg_pace: null,
    execution_status: "done_not_planned",
    execution_ratio: null,
    context_class: "unknown",
    normalized_title: normalizeSessionTitle(title),
    classification_version: 1
  };
}

module.exports = {
  DEFAULT_SCOPES,
  buildAuthorizeUrl,
  parseSignedState,
  exchangeCodeForToken,
  refreshAccessToken,
  stravaRequest,
  mapStravaActivityToSession
};
