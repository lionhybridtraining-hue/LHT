// Netlify Function: Meta Lead Ads Webhook
// Receives lead notifications from Facebook/Instagram Lead Ads.
//
// Env vars (set in Netlify Dashboard):
// - META_WEBHOOK_VERIFY_TOKEN : random token registered in Meta App Dashboard (required)
// - META_APP_SECRET           : Meta App Secret for signature verification (required for POST)
// - META_PAGE_ACCESS_TOKEN    : Page Access Token to fetch full lead field data via Graph API (optional)

const crypto = require("crypto");
const { getConfig } = require("./_lib/config");
const { insertMetaLead, upsertCentralLead } = require("./_lib/supabase");
const { sendCAPIEvent, buildUserData } = require("./_lib/meta-capi");

function safeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function fetchLeadFieldData(leadgenId, accessToken) {
  const url =
    `https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}` +
    `?fields=field_data,created_time,form_id,ad_id,ad_name,form_name` +
    `&access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph API error ${res.status}: ${text}`);
  }
  return res.json();
}

function extractCommonFields(fieldData) {
  let name = null;
  let email = null;
  let phone = null;

  for (const field of fieldData || []) {
    const key = (field.name || "").toLowerCase();
    const value = Array.isArray(field.values) ? field.values[0] : field.values;

    if (key === "full_name" || key === "name") name = value || null;
    else if (key === "email") email = value || null;
    else if (key === "phone_number" || key === "phone") phone = value || null;
  }

  return { name, email, phone };
}

function deriveMetaLeadStatus({ name, email, phone }) {
  if (name && (email || phone)) {
    return "qualified";
  }
  return "new";
}

exports.handler = async (event) => {
  const method = event.httpMethod;

  // ── GET: Meta webhook verification challenge ──────────────────────────────
  if (method === "GET") {
    const params = event.queryStringParameters || {};
    const mode = params["hub.mode"];
    const token = params["hub.verify_token"];
    const challenge = params["hub.challenge"];

    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!verifyToken) {
      return { statusCode: 500, body: "Missing META_WEBHOOK_VERIFY_TOKEN" };
    }
    if (mode === "subscribe" && token === verifyToken) {
      return { statusCode: 200, body: challenge || "" };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  // ── POST: Receive lead notification ──────────────────────────────────────
  if (method === "POST") {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";

    // Verify signature for all POST requests
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      return { statusCode: 500, body: "Missing META_APP_SECRET" };
    }
    const sigHeader =
      event.headers["x-hub-signature-256"] ||
      event.headers["X-Hub-Signature-256"] ||
      "";
    if (!sigHeader) {
      return { statusCode: 401, body: "Missing signature" };
    }
    const expected =
      "sha256=" +
      crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
    if (!safeCompare(sigHeader, expected)) {
      return { statusCode: 401, body: "Invalid signature" };
    }

    let payload;
    try {
      payload = JSON.parse(rawBody || "{}");
    } catch {
      return { statusCode: 400, body: "Invalid JSON" };
    }

    const config = getConfig();
    const accessToken = process.env.META_PAGE_ACCESS_TOKEN || null;
    const errors = [];

    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;

        const val = change.value || {};
        const leadgenId = val.leadgen_id || null;
        const pageId = val.page_id || entry.id || null;
        const formId = val.form_id || null;
        const adId = val.ad_id || null;
        const adName = val.ad_name || null;
        const formName = val.form_name || null;

        let fieldData = [];
        let name = null;
        let email = null;
        let phone = null;
        const receivedAt = new Date().toISOString();

        // Fetch full lead data from Graph API when token is available
        if (accessToken && leadgenId) {
          try {
            const graphData = await fetchLeadFieldData(leadgenId, accessToken);
            fieldData = graphData.field_data || [];
            const common = extractCommonFields(fieldData);
            name = common.name;
            email = common.email;
            phone = common.phone;
          } catch (err) {
            console.error("meta-webhook: failed to fetch lead data:", err.message);
            errors.push(err.message);
          }
        }

        try {
          const autoStatus = deriveMetaLeadStatus({ name, email, phone });
          const result = await insertMetaLead(config, {
            leadgen_id: leadgenId,
            form_id: formId,
            form_name: formName,
            page_id: pageId,
            ad_id: adId,
            ad_name: adName,
            name,
            email,
            phone,
            field_data: fieldData,
            raw_payload: val,
            status: autoStatus
          });
          if (!result || (Array.isArray(result) && !result.length)) {
            console.log(`meta-webhook: duplicate leadgen_id skipped: ${leadgenId}`);
          }

          const insertedLead = Array.isArray(result) ? result[0] || null : result || null;
          await upsertCentralLead(config, {
            metaLeadId: insertedLead ? insertedLead.id || null : null,
            source: "meta_ads",
            sourceRefId: leadgenId,
            email,
            phone,
            fullName: name,
            funnelStage: "meta_received",
            leadStatus: autoStatus,
            leadScore: autoStatus === "qualified" ? 60 : 20,
            lastActivityAt: receivedAt,
            lastActivityType: "meta_lead_received",
            attribution: {
              pageId,
              formId,
              formName,
              adId,
              adName
            },
            profile: {
              formName,
              adName,
              fieldCount: Array.isArray(fieldData) ? fieldData.length : 0
            },
            rawPayload: {
              entryId: entry.id || null,
              leadgenId,
              formId,
              adId,
              pageId
            }
          });
        } catch (err) {
          console.error("meta-webhook: failed to insert lead:", err.message);
          errors.push(err.message);
        }

        // ── CAPI: send Lead event server-side ─────────────────────────────
        if (config.metaCapiAccessToken && config.metaDatasetId) {
          try {
            const firstName = name ? name.split(" ")[0] : undefined;
            const lastName = name && name.includes(" ")
              ? name.split(" ").slice(1).join(" ")
              : undefined;

            await sendCAPIEvent(config, {
              event_name: "Lead",
              event_time: Math.floor(Date.now() / 1000),
              event_id: `lead_${leadgenId}`,
              action_source: "other",
              user_data: buildUserData({ email, phone, firstName, lastName }),
              custom_data: {
                content_name: formName || undefined,
                lead_event_source: "meta_lead_ads"
              }
            });
            console.log(`meta-webhook: CAPI Lead sent for ${leadgenId}`);
          } catch (err) {
            console.error("meta-webhook: CAPI Lead failed:", err.message);
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ received: true, errors: errors.length ? errors : undefined })
    };
  }

  return { statusCode: 405, body: "Method not allowed" };
};
