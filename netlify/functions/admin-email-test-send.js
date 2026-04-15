const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { sendTemplatedEmail } = require("./_lib/email");

class ValidationError extends Error {}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const payload = parseJsonBody(event);
    const to = normalizeEmail(payload.to);
    if (!to || !to.includes("@")) {
      throw new ValidationError("Valid 'to' email is required");
    }

    const sendResult = await sendTemplatedEmail(config, {
      to,
      templateId: String(payload.templateId || "").trim() || null,
      templateCode: String(payload.templateCode || "").trim() || null,
      subjectTemplate: payload.subjectTemplate,
      htmlTemplate: payload.htmlTemplate,
      context: payload.context && typeof payload.context === "object" ? payload.context : {},
      isTest: true,
      triggerSource: "admin_test_send",
      triggerRef: String(payload.triggerRef || "").trim() || null,
      actorIdentityId: auth.user.sub,
      channelType: String(payload.channelType || "").trim().toLowerCase() === "marketing" ? "marketing" : "transactional"
    });

    return json(200, {
      ok: true,
      sent: Boolean(sendResult.result),
      logId: sendResult.logRow ? sendResult.logRow.id : null,
      providerMessageId: sendResult.result && sendResult.result.id ? sendResult.result.id : null
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { error: err.message });
    }
    console.error("[admin-email-test-send]", err);
    return json(500, { error: err.message || "Erro ao enviar teste de email" });
  }
};
