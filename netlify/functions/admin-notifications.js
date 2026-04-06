const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listAdminNotifications, markAdminNotificationRead } = require("./_lib/supabase");

exports.handler = async (event) => {
  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    if (event.httpMethod === "GET") {
      const qs = event.queryStringParameters || {};
      const includeRead = qs.includeRead === "1" || qs.includeRead === "true";
      const limit = Math.min(parseInt(qs.limit || "50", 10) || 50, 200);
      const notifications = await listAdminNotifications(config, { includeRead, limit });
      const unreadCount = notifications.filter((n) => !n.read_at && !n.dismissed_at).length;
      return json(200, { notifications, unreadCount });
    }

    if (event.httpMethod === "PATCH") {
      const body = parseJsonBody(event);
      const id = (body.id || "").toString().trim();
      const action = (body.action || "").toString().trim();
      if (!id) return json(400, { error: "id is required" });
      if (!["read", "dismiss"].includes(action)) {
        return json(400, { error: "action must be 'read' or 'dismiss'" });
      }
      const updated = await markAdminNotificationRead(config, id, action);
      if (!updated) return json(404, { error: "Notification not found" });
      return json(200, { notification: updated });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    console.error("[admin-notifications] Error:", err.message || err);
    return json(500, { error: err.message || "Erro interno" });
  }
};
