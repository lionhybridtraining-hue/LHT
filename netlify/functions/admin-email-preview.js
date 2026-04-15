const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { previewEmailTemplate } = require("./_lib/email");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const payload = parseJsonBody(event);
    const preview = await previewEmailTemplate(config, {
      templateId: String(payload.templateId || "").trim() || null,
      templateCode: String(payload.templateCode || "").trim() || null,
      subjectTemplate: payload.subjectTemplate,
      htmlTemplate: payload.htmlTemplate,
      context: payload.context && typeof payload.context === "object" ? payload.context : {}
    });

    return json(200, {
      preview: {
        subject: preview.subject,
        html: preview.html,
        templateId: preview.template ? preview.template.id : null,
        templateCode: preview.template ? preview.template.code : (payload.templateCode || ""),
        templateName: preview.template ? preview.template.name : "",
        templateVersion: preview.version ? preview.version.version_number : null
      }
    });
  } catch (err) {
    console.error("[admin-email-preview]", err);
    return json(500, { error: err.message || "Erro ao gerar preview" });
  }
};
