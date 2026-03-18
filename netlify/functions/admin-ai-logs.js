const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listAiLogs } = require("./_lib/supabase");

function parseBoolean(value) {
  if (value == null || value === "") return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function mapAiLog(row) {
  return {
    id: row.id,
    feature: row.feature,
    athleteId: row.athlete_id || null,
    model: row.model || null,
    systemPromptSnapshot: row.system_prompt_snapshot || "",
    userPromptSnapshot: row.user_prompt_snapshot || "",
    inputData: row.input_data || null,
    outputData: row.output_data || null,
    tokensEstimated: row.tokens_estimated == null ? null : Number(row.tokens_estimated),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    success: row.success === true,
    error: row.error || "",
    createdAt: row.created_at || null
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const params = new URLSearchParams(event.rawQuery || "");
    const feature = (params.get("feature") || "").trim() || undefined;
    const athleteId = (params.get("athleteId") || "").trim() || undefined;
    const from = (params.get("from") || "").trim() || undefined;
    const to = (params.get("to") || "").trim() || undefined;
    const success = parseBoolean(params.get("success"));

    const limitRaw = Number(params.get("limit"));
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;

    const logs = await listAiLogs(config, {
      feature,
      athleteId,
      from,
      to,
      success,
      limit
    });

    return json(200, {
      logs: Array.isArray(logs) ? logs.map(mapAiLog) : []
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao listar logs de IA" });
  }
};
