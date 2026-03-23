// Meta Conversions API (CAPI) — server-side event sender
// Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
const crypto = require("crypto");

const GRAPH_API_VERSION = "v21.0";

/**
 * SHA-256 hash a value (lowercase + trimmed) per Meta requirements.
 * Returns null if value is empty/null.
 */
function hashValue(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Build hashed user_data object for CAPI.
 * All PII fields are SHA-256 hashed per Meta spec.
 */
function buildUserData({ email, phone, firstName, lastName, fbp, fbc, clientIpAddress, clientUserAgent }) {
  const ud = {};
  if (email) ud.em = [hashValue(email)];
  if (phone) ud.ph = [hashValue(phone.replace(/[\s\-()]/g, ""))];
  if (firstName) ud.fn = [hashValue(firstName)];
  if (lastName) ud.ln = [hashValue(lastName)];
  if (fbp) ud.fbp = fbp; // not hashed — browser ID
  if (fbc) ud.fbc = fbc; // not hashed — click ID
  if (clientIpAddress) ud.client_ip_address = clientIpAddress;
  if (clientUserAgent) ud.client_user_agent = clientUserAgent;
  return ud;
}

/**
 * Send one or more events to Meta Conversions API.
 *
 * @param {object} config — must have metaCapiAccessToken, metaDatasetId
 * @param {Array<object>} events — array of event objects:
 *   { event_name, event_time, event_id, event_source_url, action_source, user_data, custom_data }
 * @returns {{ ok: boolean, status?: number, reason?: string, response?: object }}
 */
async function sendCAPIEvents(config, events) {
  if (!config.metaCapiAccessToken || !config.metaDatasetId) {
    return { ok: false, reason: "missing_meta_capi_config" };
  }
  if (!events || !events.length) {
    return { ok: false, reason: "no_events" };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(config.metaDatasetId)}/events`;

  const body = {
    data: events.map(e => ({
      event_name: e.event_name,
      event_time: e.event_time || Math.floor(Date.now() / 1000),
      event_id: e.event_id || undefined,
      event_source_url: e.event_source_url || undefined,
      action_source: e.action_source || "website",
      user_data: e.user_data || {},
      custom_data: e.custom_data || undefined
    })),
    access_token: config.metaCapiAccessToken
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { ok: res.ok, status: res.status, response: parsed };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Convenience: send a single event.
 */
async function sendCAPIEvent(config, event) {
  return sendCAPIEvents(config, [event]);
}

module.exports = {
  hashValue,
  buildUserData,
  sendCAPIEvents,
  sendCAPIEvent
};
