const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");

async function supabaseRequest({ url, serviceRoleKey, path, method = "GET", prefer, head = false }) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: prefer || "return=representation"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    const detail = payload && payload.message ? payload.message : `Supabase error ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  if (head || method === "HEAD") {
    return {
      contentRange: response.headers.get("content-range") || ""
    };
  }

  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function countRows(config, relationPath) {
  const result = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `${relationPath}&select=id`,
    method: "HEAD",
    prefer: "count=exact",
    head: true
  });
  const contentRange = result && result.contentRange ? result.contentRange : "";
  const totalPart = contentRange.split("/")[1] || "0";
  const total = Number.parseInt(totalPart, 10);
  return Number.isFinite(total) ? total : 0;
}

function buildDateIso(daysAgo) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function groupLoginEvents(events) {
  const countsByIdentity = new Map();
  const lastByIdentity = new Map();

  (Array.isArray(events) ? events : []).forEach((event) => {
    const identityId = event && event.identity_id ? String(event.identity_id) : "";
    if (!identityId) return;
    countsByIdentity.set(identityId, (countsByIdentity.get(identityId) || 0) + 1);
    const previous = lastByIdentity.get(identityId);
    const current = event.logged_in_at || null;
    if (!previous || (current && current > previous)) {
      lastByIdentity.set(identityId, current);
    }
  });

  return { countsByIdentity, lastByIdentity };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const qs = event.queryStringParameters || {};
    const limit = Math.min(Math.max(parseInt(qs.limit || "50", 10) || 50, 1), 100);

    const last7dIso = buildDateIso(7);
    const last30dIso = buildDateIso(30);

    let totalLoginEvents = 0;
    let active7d = 0;
    let active30d = 0;
    let loggedInAthletes = 0;
    let appInstalledLeads = 0;
    let recentAthletes = [];
    let loginEvents = [];
    let leads = [];

    try {
      [totalLoginEvents, active7d, active30d, loggedInAthletes, appInstalledLeads, recentAthletes, loginEvents, leads] = await Promise.all([
        countRows(config, "login_events?limit=1"),
        countRows(config, `athletes?last_login_at=not.is.null&last_login_at=gte.${encodeURIComponent(last7dIso)}&limit=1`),
        countRows(config, `athletes?last_login_at=not.is.null&last_login_at=gte.${encodeURIComponent(last30dIso)}&limit=1`),
        countRows(config, "athletes?last_login_at=not.is.null&limit=1"),
        countRows(config, "leads_central?funnel_stage=eq.app_installed&limit=1"),
        supabaseRequest({
          url: config.supabaseUrl,
          serviceRoleKey: config.supabaseServiceRoleKey,
          path: `athletes?last_login_at=not.is.null&select=id,name,email,identity_id,last_login_at,funnel_stage&order=last_login_at.desc&limit=${limit}`
        }),
        supabaseRequest({
          url: config.supabaseUrl,
          serviceRoleKey: config.supabaseServiceRoleKey,
          path: "login_events?select=identity_id,logged_in_at&order=logged_in_at.desc&limit=1000"
        }),
        supabaseRequest({
          url: config.supabaseUrl,
          serviceRoleKey: config.supabaseServiceRoleKey,
          path: `leads_central?identity_id=not.is.null&select=identity_id,source,last_source,funnel_stage,lead_status,last_activity_at,last_activity_type&order=updated_at.desc&limit=${Math.max(limit * 5, 200)}`
        })
      ]);
    } catch (err) {
      const message = String(err && err.message ? err.message : err || "");
      if (message.includes("login_events") || message.includes("last_login_at") || message.includes("app_installed")) {
        return json(200, {
          ready: false,
          message: "O schema de retenção ainda não está aplicado. Corre a migration-add-login-tracking.sql primeiro.",
          summary: {
            totalLoginEvents: 0,
            active7d: 0,
            active30d: 0,
            loggedInAthletes: 0,
            appInstalledLeads: 0
          },
          recent: []
        });
      }
      throw err;
    }

    const { countsByIdentity, lastByIdentity } = groupLoginEvents(loginEvents);
    const leadsByIdentity = new Map();
    (Array.isArray(leads) ? leads : []).forEach((lead) => {
      const identityId = lead && lead.identity_id ? String(lead.identity_id) : "";
      if (!identityId || leadsByIdentity.has(identityId)) return;
      leadsByIdentity.set(identityId, lead);
    });

    const recent = (Array.isArray(recentAthletes) ? recentAthletes : []).map((athlete) => {
      const identityId = athlete.identity_id || "";
      const lead = leadsByIdentity.get(identityId) || null;
      return {
        athleteId: athlete.id || null,
        identityId,
        name: athlete.name || null,
        email: athlete.email || null,
        lastLoginAt: athlete.last_login_at || null,
        loginCount: countsByIdentity.get(identityId) || 0,
        latestLoginEventAt: lastByIdentity.get(identityId) || athlete.last_login_at || null,
        funnelStage: (lead && lead.funnel_stage) || athlete.funnel_stage || null,
        leadStatus: lead && lead.lead_status ? lead.lead_status : null,
        source: (lead && (lead.last_source || lead.source)) || null,
        lastActivityAt: lead && lead.last_activity_at ? lead.last_activity_at : null,
        lastActivityType: lead && lead.last_activity_type ? lead.last_activity_type : null
      };
    });

    return json(200, {
      ready: true,
      summary: {
        totalLoginEvents,
        active7d,
        active30d,
        loggedInAthletes,
        appInstalledLeads
      },
      recent
    });
  } catch (err) {
    console.error("[admin-login-retention] Error:", err.message || err);
    return json(500, { error: err.message || "Erro interno" });
  }
};