const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");

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
    const message = payload && payload.message ? payload.message : `Supabase error ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function getExistingByIdentity(config, identityId) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `onboarding_intake?identity_id=eq.${encodeURIComponent(identityId)}&select=id,identity_id,email,answers,submitted_at,updated_at&limit=1`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);
    if (!user || !user.id || !user.email) {
      return json(401, { error: "Authentication required" });
    }

    if (event.httpMethod === "GET") {
      const existing = await getExistingByIdentity(config, user.id);
      return json(200, {
        ok: true,
        answers: existing && existing.answers ? existing.answers : {},
        submittedAt: existing ? existing.submitted_at : null,
        updatedAt: existing ? existing.updated_at : null
      });
    }

    const payload = parseJsonBody(event);
    const answers = payload.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return json(400, { error: "Invalid answers payload" });
    }

    const row = {
      identity_id: user.id,
      email: user.email,
      answers,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const upserted = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: "onboarding_intake?on_conflict=identity_id",
      method: "POST",
      body: [row],
      prefer: "resolution=merge-duplicates,return=representation"
    });

    const record = Array.isArray(upserted) ? upserted[0] || null : null;

    return json(200, {
      ok: true,
      submittedAt: record ? record.submitted_at : row.submitted_at
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao guardar onboarding" });
  }
};
