const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  listAiPrompts,
  getAiPromptById,
  createAiPrompt,
  updateAiPrompt,
  createAiPromptVersion,
  listAiPromptVersions
} = require("./_lib/supabase");

class ValidationError extends Error {}

function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizePromptPayload(payload) {
  const name = String(payload.name || "").trim();
  const feature = String(payload.feature || "").trim();
  const type = String(payload.type || "system").trim().toLowerCase();
  const content = String(payload.content || "").trim();
  const notes = payload.notes == null ? null : String(payload.notes);
  const isActive = parseBoolean(payload.isActive, true);

  if (!name) throw new ValidationError("name is required");
  if (!feature) throw new ValidationError("feature is required");
  if (!["system", "user"].includes(type)) throw new ValidationError("type must be system or user");
  if (!content) throw new ValidationError("content is required");

  return {
    name,
    feature,
    type,
    content,
    notes,
    is_active: isActive
  };
}

function mapPrompt(row) {
  return {
    id: row.id,
    name: row.name,
    feature: row.feature,
    type: row.type,
    content: row.content,
    version: row.version,
    isActive: row.is_active === true,
    notes: row.notes || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function mapVersion(row) {
  return {
    id: row.id,
    promptId: row.prompt_id,
    version: row.version,
    content: row.content,
    notes: row.notes || "",
    createdAt: row.created_at || null
  };
}

async function deactivateSlotIfNeeded(config, { feature, type, exceptId }) {
  const prompts = await listAiPrompts(config, { feature, type });
  const updates = (prompts || [])
    .filter((prompt) => prompt.is_active && prompt.id !== exceptId)
    .map((prompt) => updateAiPrompt(config, prompt.id, { is_active: false }));
  await Promise.all(updates);
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (!["GET", "POST", "PATCH"].includes(method)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const params = new URLSearchParams(event.rawQuery || "");

    if (method === "GET") {
      const promptId = (params.get("promptId") || "").trim();
      const includeVersions = parseBoolean(params.get("includeVersions"), false);

      if (promptId && includeVersions) {
        const versions = await listAiPromptVersions(config, promptId);
        return json(200, { versions: (versions || []).map(mapVersion) });
      }

      const feature = (params.get("feature") || "").trim() || undefined;
      const type = (params.get("type") || "").trim() || undefined;
      const prompts = await listAiPrompts(config, { feature, type });
      return json(200, { prompts: (prompts || []).map(mapPrompt) });
    }

    const payload = parseJsonBody(event);

    if (method === "POST") {
      const normalized = normalizePromptPayload(payload);

      if (normalized.is_active) {
        await deactivateSlotIfNeeded(config, {
          feature: normalized.feature,
          type: normalized.type,
          exceptId: null
        });
      }

      const created = await createAiPrompt(config, {
        name: normalized.name,
        feature: normalized.feature,
        type: normalized.type,
        content: normalized.content,
        version: 1,
        is_active: normalized.is_active,
        notes: normalized.notes
      });

      return json(201, { prompt: mapPrompt(created) });
    }

    const id = String(payload.id || "").trim();
    if (!id) {
      throw new ValidationError("id is required");
    }

    const existing = await getAiPromptById(config, id);
    if (!existing) {
      return json(404, { error: "Prompt not found" });
    }

    await createAiPromptVersion(config, {
      prompt_id: existing.id,
      version: existing.version,
      content: existing.content,
      notes: payload.versionNote == null ? existing.notes : String(payload.versionNote)
    });

    const restoreVersion = Number(payload.restoreVersion);
    const isRestore = Number.isInteger(restoreVersion) && restoreVersion > 0;

    let nextContent = existing.content;
    let nextNotes = payload.notes == null ? existing.notes : String(payload.notes);

    if (isRestore) {
      const versions = await listAiPromptVersions(config, existing.id);
      const target = (versions || []).find((versionRow) => versionRow.version === restoreVersion);
      if (!target) {
        throw new ValidationError("restoreVersion not found in history");
      }
      nextContent = target.content;
      nextNotes = payload.notes == null
        ? `Restored from version ${restoreVersion}`
        : String(payload.notes);
    } else {
      const content = String(payload.content || "").trim();
      if (!content) throw new ValidationError("content is required");
      nextContent = content;
    }

    const nextName = payload.name == null ? existing.name : String(payload.name).trim() || existing.name;
    const shouldBeActive = payload.isActive == null ? existing.is_active === true : parseBoolean(payload.isActive, true);

    if (shouldBeActive) {
      await deactivateSlotIfNeeded(config, {
        feature: existing.feature,
        type: existing.type,
        exceptId: existing.id
      });
    }

    const updated = await updateAiPrompt(config, existing.id, {
      name: nextName,
      content: nextContent,
      notes: nextNotes,
      version: Number(existing.version || 1) + 1,
      is_active: shouldBeActive
    });

    return json(200, { prompt: mapPrompt(updated) });
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { error: err.message });
    }
    return json(500, { error: err.message || "Erro ao gerir prompts de IA" });
  }
};
