const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  listEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  softDeleteEmailTemplate,
  listEmailTemplateVersions,
  getEmailTemplateById,
  getEmailTemplateByCode
} = require("./_lib/supabase");

class ValidationError extends Error {}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeTemplatePayload(payload, { isPatch = false } = {}) {
  const normalized = {};

  if (!isPatch || payload.code !== undefined) {
    const code = normalizeCode(payload.code);
    if (!code) throw new ValidationError("code is required");
    normalized.code = code;
  }

  if (!isPatch || payload.name !== undefined) {
    const name = String(payload.name || "").trim();
    if (!name) throw new ValidationError("name is required");
    normalized.name = name;
  }

  if (!isPatch || payload.subjectTemplate !== undefined) {
    const subjectTemplate = String(payload.subjectTemplate || "").trim();
    if (!subjectTemplate) throw new ValidationError("subjectTemplate is required");
    normalized.subject_template = subjectTemplate;
  }

  if (!isPatch || payload.htmlTemplate !== undefined) {
    const htmlTemplate = String(payload.htmlTemplate || "").trim();
    if (!htmlTemplate) throw new ValidationError("htmlTemplate is required");
    normalized.html_template = htmlTemplate;
  }

  if (payload.description !== undefined || !isPatch) {
    normalized.description = String(payload.description || "").trim() || null;
  }

  if (payload.channelType !== undefined || !isPatch) {
    const channelType = String(payload.channelType || "transactional").trim().toLowerCase();
    if (!["transactional", "marketing"].includes(channelType)) {
      throw new ValidationError("channelType must be 'transactional' or 'marketing'");
    }
    normalized.channel_type = channelType;
  }

  if (payload.isActive !== undefined) {
    normalized.is_active = payload.isActive !== false;
  }

  return normalized;
}

function toClientTemplate(row, versions = []) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || "",
    channelType: row.channel_type || "transactional",
    subjectTemplate: row.subject_template || "",
    htmlTemplate: row.html_template || "",
    isActive: row.is_active !== false,
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    versions: Array.isArray(versions)
      ? versions.map((version) => ({
        id: version.id,
        versionNumber: version.version_number,
        subjectTemplate: version.subject_template || "",
        htmlTemplate: version.html_template || "",
        changeNote: version.change_note || "",
        createdBy: version.created_by || null,
        createdAt: version.created_at || null
      }))
      : []
  };
}

async function handleList(config, event) {
  const query = event.queryStringParameters || {};
  const includeInactive = String(query.includeInactive || "1") !== "0";
  const includeDeleted = String(query.includeDeleted || "0") === "1";
  const includeVersions = String(query.includeVersions || "0") === "1";

  const templates = await listEmailTemplates(config, { includeInactive, includeDeleted });
  if (!includeVersions) {
    return json(200, { templates: templates.map((template) => toClientTemplate(template)) });
  }

  const withVersions = await Promise.all(
    templates.map(async (template) => {
      const versions = await listEmailTemplateVersions(config, template.id);
      return toClientTemplate(template, versions);
    })
  );

  return json(200, { templates: withVersions });
}

async function ensureUnique(config, payload, templateId = "") {
  if (payload.code) {
    const existingByCode = await getEmailTemplateByCode(config, payload.code);
    if (existingByCode && existingByCode.id !== templateId) {
      throw new ValidationError("Template code already exists");
    }
  }

  if (payload.name) {
    const templates = await listEmailTemplates(config, { includeInactive: true, includeDeleted: false });
    const duplicate = templates.find((item) =>
      item.id !== templateId &&
      String(item.name || "").trim().toLowerCase() === String(payload.name || "").trim().toLowerCase()
    );
    if (duplicate) {
      throw new ValidationError("Template name already exists");
    }
  }
}

async function handleCreate(config, event, auth) {
  const payload = parseJsonBody(event);
  const normalized = normalizeTemplatePayload(payload, { isPatch: false });
  await ensureUnique(config, normalized);

  const created = await createEmailTemplate(config, {
    ...normalized,
    created_by: auth.user.sub,
    updated_by: auth.user.sub
  });

  return json(201, { template: toClientTemplate(created) });
}

async function handlePatch(config, event, auth) {
  const payload = parseJsonBody(event);
  const templateId = String(payload.id || "").trim();
  if (!templateId) {
    throw new ValidationError("id is required");
  }

  const existing = await getEmailTemplateById(config, templateId);
  if (!existing) {
    return json(404, { error: "Template not found" });
  }

  const normalized = normalizeTemplatePayload(payload, { isPatch: true });
  await ensureUnique(config, normalized, templateId);

  const updated = await updateEmailTemplate(
    config,
    templateId,
    {
      ...normalized,
      updated_by: auth.user.sub
    },
    {
      versionChangeNote: String(payload.versionChangeNote || "").trim() || "Updated in Admin"
    }
  );

  const versions = await listEmailTemplateVersions(config, templateId);
  return json(200, { template: toClientTemplate(updated, versions) });
}

async function handleDelete(config, event, auth) {
  const payload = parseJsonBody(event);
  const templateId = String(payload.id || "").trim();
  if (!templateId) {
    throw new ValidationError("id is required");
  }

  const deleted = await softDeleteEmailTemplate(config, templateId, auth.user.sub);
  if (!deleted) {
    return json(404, { error: "Template not found" });
  }

  return json(200, { ok: true, template: toClientTemplate(deleted) });
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    if (method === "GET") {
      return await handleList(config, event);
    }
    if (method === "POST") {
      return await handleCreate(config, event, auth);
    }
    if (method === "PATCH") {
      return await handlePatch(config, event, auth);
    }
    return await handleDelete(config, event, auth);
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { error: err.message });
    }
    console.error("[admin-email-templates]", err);
    return json(500, { error: err.message || "Erro ao gerir templates de email" });
  }
};
