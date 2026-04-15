const crypto = require("crypto");
const { createAdminNotification, listAdminNotifications } = require("./supabase");

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function buildFingerprint(source, title, message, status) {
  const raw = `${normalizeText(source)}|${normalizeText(title)}|${normalizeText(message)}|${Number(status) || 0}`;
  return crypto.createHash("sha1").update(raw).digest("hex");
}

function toErrorMessage(error, fallback) {
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback.trim();
  }
  return "Erro operacional sem detalhe";
}

async function reportOperationalError(config, {
  source,
  title,
  error,
  message,
  status,
  metadata,
  dedupeWindowMinutes = 15,
  severity = "error",
  type = "operational_error"
} = {}) {
  if (!config) return { created: false, reason: "missing_config" };

  try {
    const safeSource = normalizeText(source) || "unknown_source";
    const safeTitle = normalizeText(title) || "Erro operacional";
    const safeMessage = normalizeText(toErrorMessage(error, message));
    const safeStatus = Number.isInteger(status)
      ? status
      : (Number.isInteger(error && error.status) ? error.status : 500);

    const fingerprint = buildFingerprint(safeSource, safeTitle, safeMessage, safeStatus);
    const recent = await listAdminNotifications(config, { includeRead: true, limit: 120 });
    const now = Date.now();
    const windowMs = Math.max(1, Number(dedupeWindowMinutes) || 15) * 60 * 1000;

    const duplicate = (Array.isArray(recent) ? recent : []).find((row) => {
      if (!row || !row.metadata || typeof row.metadata !== "object") return false;
      if (row.type !== type) return false;
      if (row.metadata.fingerprint !== fingerprint) return false;
      const createdAtMs = row.created_at ? Date.parse(row.created_at) : NaN;
      if (!Number.isFinite(createdAtMs)) return false;
      return (now - createdAtMs) <= windowMs;
    });

    if (duplicate) {
      return { created: false, deduped: true, notificationId: duplicate.id };
    }

    const created = await createAdminNotification(config, {
      type,
      severity,
      title: safeTitle,
      message: safeMessage,
      metadata: {
        fingerprint,
        source: safeSource,
        status: safeStatus,
        occurredAt: new Date().toISOString(),
        ...(metadata && typeof metadata === "object" ? metadata : {})
      }
    });

    return {
      created: Boolean(created),
      deduped: false,
      notificationId: created && created.id ? created.id : null
    };
  } catch (notifyErr) {
    console.error("[ops-notifications] Failed to report operational error:", notifyErr && notifyErr.message ? notifyErr.message : notifyErr);
    return { created: false, reason: "notify_failed" };
  }
}

module.exports = {
  reportOperationalError
};
