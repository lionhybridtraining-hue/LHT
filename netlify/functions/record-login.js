const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");
const {
  getAthleteByIdentity,
  upsertAthleteByIdentity,
  updateAthlete,
  upsertCentralLead
} = require("./_lib/supabase");

async function supabaseRequest({ url, serviceRoleKey, path, method = "GET", body, prefer }) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: prefer || "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const detail = payload && payload.message ? payload.message : `Supabase error ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function inferLeadStatusFromStage(stage) {
  if (["onboarding_submitted", "plan_generated", "app_installed", "qualified", "converted"].includes(stage)) {
    return "qualified";
  }
  return "new";
}

function compactDeviceHint(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 220);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);
    if (!user || !user.sub) {
      return json(401, { error: "Authentication required" });
    }

    const now = new Date().toISOString();
    const identityId = user.sub;
    let athlete = await getAthleteByIdentity(config, identityId);
    if (!athlete) {
      athlete = await upsertAthleteByIdentity(config, {
        identityId,
        email: user.email || "",
        name: user.email || identityId
      });
    }

    if (!athlete || !athlete.id) {
      return json(500, { error: "Unable to resolve athlete profile" });
    }

    try {
      await updateAthlete(config, athlete.id, { last_login_at: now });
    } catch (err) {
      console.warn("[record-login] Unable to update athletes.last_login_at:", err && err.message ? err.message : err);
    }

    const deviceHint = compactDeviceHint(
      (event.headers && (event.headers["user-agent"] || event.headers["User-Agent"])) || ""
    );

    try {
      await supabaseRequest({
        url: config.supabaseUrl,
        serviceRoleKey: config.supabaseServiceRoleKey,
        path: "login_events",
        method: "POST",
        body: [{
          athlete_id: athlete.id,
          identity_id: identityId,
          logged_in_at: now,
          device_hint: deviceHint,
          created_at: now
        }],
        prefer: "return=minimal"
      });
    } catch (err) {
      console.warn("[record-login] Unable to insert login_events row:", err && err.message ? err.message : err);
    }

    try {
      await upsertCentralLead(config, {
        athleteId: athlete.id,
        identityId,
        source: "onboarding",
        email: athlete.email || user.email || "",
        phone: athlete.phone || null,
        fullName: athlete.name || null,
        funnelStage: athlete.funnel_stage || "landing",
        leadStatus: inferLeadStatusFromStage(athlete.funnel_stage || "landing"),
        lastActivityAt: now,
        lastActivityType: "app_login",
        profile: {
          lastLoginAt: now
        },
        rawPayload: {
          endpoint: "record-login"
        }
      });
    } catch (err) {
      console.warn("[record-login] Unable to upsert central lead:", err && err.message ? err.message : err);
    }

    return json(200, {
      ok: true,
      athleteId: athlete.id,
      loggedInAt: now
    });
  } catch (err) {
    console.error("[record-login] Unexpected error:", err);
    return json(500, { error: err.message || "Internal server error" });
  }
};
