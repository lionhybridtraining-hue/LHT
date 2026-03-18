const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listMetaLeads, updateMetaLead } = require("./_lib/supabase");

const VALID_STATUSES = ["new", "contacted", "qualified", "disqualified"];

function mapLead(row) {
  return {
    id: row.id,
    leadgenId: row.leadgen_id,
    formId: row.form_id,
    formName: row.form_name,
    pageId: row.page_id,
    adId: row.ad_id,
    adName: row.ad_name,
    name: row.name,
    email: row.email,
    phone: row.phone,
    fieldData: row.field_data || [],
    status: row.status,
    notes: row.notes || null,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (!["GET", "PATCH"].includes(method)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    if (method === "GET") {
      try {
        const rows = await listMetaLeads(config);
        const leads = Array.isArray(rows) ? rows.map(mapLead) : [];
        return json(200, { leads });
      } catch (err) {
        return json(500, { error: `Erro ao listar leads: ${err.message}` });
      }
    }

    // PATCH: update lead status and/or notes
    let payload;
    try {
      payload = parseJsonBody(event);
    } catch (err) {
      return json(400, { error: `JSON invalido: ${err.message}` });
    }
    const { id, status, notes } = payload;

    if (!id) {
      return json(400, { error: "id is required" });
    }
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return json(400, { error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    const patch = {};
    if (status !== undefined) patch.status = status;
    if (notes !== undefined) patch.notes = notes;

    if (!Object.keys(patch).length) {
      return json(400, { error: "Nothing to update" });
    }

    try {
      const rows = await updateMetaLead(config, id, patch);
      const updated = Array.isArray(rows) && rows.length ? mapLead(rows[0]) : null;
      return json(200, { lead: updated });
    } catch (err) {
      return json(500, { error: `Erro ao atualizar lead: ${err.message}` });
    }
  } catch (err) {
    return json(500, { error: err.message || "Erro interno" });
  }
};
