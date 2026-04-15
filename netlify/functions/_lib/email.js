const { Resend } = require("resend");
const {
  getEmailTemplateById,
  getEmailTemplateByCode,
  listEmailTemplateVersions,
  createEmailSendLog
} = require("./supabase");

function resolveContextPath(obj, path) {
  if (!obj || typeof obj !== "object") return "";
  const segments = String(path || "").split(".").filter(Boolean);
  let current = obj;
  for (const segment of segments) {
    if (current == null || typeof current !== "object") return "";
    current = current[segment];
  }
  if (current == null) return "";
  return typeof current === "string" ? current : String(current);
}

function renderTemplateString(template, context) {
  const rawTemplate = String(template || "");
  return rawTemplate.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, path) => {
    const value = resolveContextPath(context, path);
    return value == null ? "" : String(value);
  });
}

async function resolveTemplateForRender(config, { templateId, templateCode, subjectTemplate, htmlTemplate }) {
  if (subjectTemplate && htmlTemplate) {
    return {
      template: null,
      version: null,
      subjectTemplate: String(subjectTemplate || ""),
      htmlTemplate: String(htmlTemplate || "")
    };
  }

  let template = null;
  if (templateId) {
    template = await getEmailTemplateById(config, templateId);
  } else if (templateCode) {
    template = await getEmailTemplateByCode(config, templateCode);
  }

  if (!template) {
    return {
      template: null,
      version: null,
      subjectTemplate: String(subjectTemplate || ""),
      htmlTemplate: String(htmlTemplate || "")
    };
  }

  const versions = await listEmailTemplateVersions(config, template.id);
  const latestVersion = Array.isArray(versions) && versions.length ? versions[0] : null;

  return {
    template,
    version: latestVersion,
    subjectTemplate: template.subject_template || "",
    htmlTemplate: template.html_template || ""
  };
}

/**
 * Send an email via Resend. Fails silently (logs error) so callers
 * are not blocked by email failures.
 */
async function sendEmail(config, { to, subject, html }) {
  if (!config.resendApiKey) {
    console.warn("[email] RESEND_API_KEY not configured — skipping email.");
    return null;
  }

  try {
    const resend = new Resend(config.resendApiKey);
    const { data, error } = await resend.emails.send({
      from: config.emailFrom,
      to,
      subject,
      html
    });

    if (error) {
      console.error("[email] Resend API error:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[email] Failed to send:", err.message || err);
    return null;
  }
}

async function previewEmailTemplate(config, options = {}) {
  const resolved = await resolveTemplateForRender(config, options);
  const context = options && options.context && typeof options.context === "object"
    ? options.context
    : {};

  const subject = renderTemplateString(resolved.subjectTemplate, context);
  const html = renderTemplateString(resolved.htmlTemplate, context);

  return {
    subject,
    html,
    template: resolved.template,
    version: resolved.version
  };
}

async function sendTemplatedEmail(config, options = {}) {
  const to = String(options.to || "").trim().toLowerCase();
  if (!to) {
    throw new Error("Missing recipient email");
  }

  const context = options && options.context && typeof options.context === "object"
    ? options.context
    : {};

  const preview = await previewEmailTemplate(config, options);
  const attemptedAtIso = new Date().toISOString();
  const result = await sendEmail(config, {
    to,
    subject: preview.subject,
    html: preview.html
  });

  const template = preview.template;
  const version = preview.version;
  const isTest = options.isTest === true;
  const logPayload = {
    template_id: template ? template.id : null,
    template_code: template ? template.code : (options.templateCode || null),
    template_name: template ? template.name : null,
    template_version_number: version && Number.isInteger(version.version_number) ? version.version_number : null,
    template_snapshot: {
      template_id: template ? template.id : null,
      code: template ? template.code : (options.templateCode || null),
      name: template ? template.name : null,
      channel_type: template ? template.channel_type : null,
      subject_template: template ? template.subject_template : (options.subjectTemplate || ""),
      html_template: template ? template.html_template : (options.htmlTemplate || "")
    },
    channel_type: template ? template.channel_type : (options.channelType || "transactional"),
    recipient_email: to,
    recipient_athlete_id: options.athleteId || null,
    subject_rendered: preview.subject,
    body_rendered: preview.html,
    render_context: context,
    is_test: isTest,
    status: result ? "sent" : "failed",
    provider: "resend",
    provider_message_id: result && result.id ? result.id : null,
    provider_error: result ? null : "Email provider returned no result",
    trigger_source: options.triggerSource || null,
    trigger_ref: options.triggerRef || null,
    actor_identity_id: options.actorIdentityId || null,
    attempted_at: attemptedAtIso,
    sent_at: result ? attemptedAtIso : null
  };

  let logRow = null;
  try {
    logRow = await createEmailSendLog(config, logPayload);
  } catch (logErr) {
    console.error("[email] Failed to write send log:", logErr.message || logErr);
  }

  return {
    result,
    logRow,
    subject: preview.subject,
    html: preview.html,
    template,
    version
  };
}

function buildCheckinApprovedEmail({ athleteName, weekStart }) {
  const name = athleteName || "Atleta";
  const week = weekStart || "";
  return {
    subject: `Check-in semanal revisado — semana de ${week}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <h2 style="color:#c8a415;margin:0 0 16px;">Lion Hybrid Training</h2>
        <p>Ola ${name},</p>
        <p>O teu coach ja revisou o teu check-in da semana de <strong>${week}</strong>.</p>
        <p>Obrigado pelo teu compromisso com o processo!</p>
        <br/>
        <p style="font-size:13px;color:#888;">— Equipa Lion Hybrid Training</p>
      </div>
    `
  };
}

module.exports = {
  sendEmail,
  previewEmailTemplate,
  sendTemplatedEmail,
  buildCheckinApprovedEmail
};
