const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listEmailSendLogs } = require("./_lib/supabase");

function parseBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "1" || normalized === "true") return true;
  if (normalized === "0" || normalized === "false") return false;
  return null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const query = event.queryStringParameters || {};
    const limitRaw = Number(query.limit);
    const offsetRaw = Number(query.offset);

    const logs = await listEmailSendLogs(config, {
      templateId: String(query.templateId || "").trim() || null,
      status: String(query.status || "").trim() || null,
      channelType: String(query.channelType || "").trim() || null,
      athleteId: String(query.athleteId || "").trim() || null,
      isTest: parseBoolean(query.isTest),
      from: String(query.from || "").trim() || null,
      to: String(query.to || "").trim() || null,
      limit: Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50,
      offset: Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0
    });

    const mapped = Array.isArray(logs)
      ? logs.map((log) => ({
        id: log.id,
        templateId: log.template_id || null,
        templateCode: log.template_code || "",
        templateName: log.template_name || "",
        templateVersionNumber: log.template_version_number || null,
        channelType: log.channel_type || "",
        recipientEmail: log.recipient_email || "",
        recipientAthleteId: log.recipient_athlete_id || null,
        subjectRendered: log.subject_rendered || "",
        isTest: log.is_test === true,
        status: log.status || "",
        provider: log.provider || "",
        providerMessageId: log.provider_message_id || "",
        providerError: log.provider_error || "",
        triggerSource: log.trigger_source || "",
        triggerRef: log.trigger_ref || "",
        actorIdentityId: log.actor_identity_id || "",
        attemptedAt: log.attempted_at || null,
        sentAt: log.sent_at || null,
        createdAt: log.created_at || null
      }))
      : [];

    return json(200, { logs: mapped, total: mapped.length });
  } catch (err) {
    console.error("[admin-email-sends]", err);
    return json(500, { error: err.message || "Erro ao listar logs de envio" });
  }
};
