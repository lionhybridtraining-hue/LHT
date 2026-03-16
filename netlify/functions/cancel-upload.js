const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { deriveUploadBatchId } = require("./_lib/upload-batch");
const {
  getLatestUploadBatchId,
  getWeeklyCheckinByBatch,
  deleteTrainingSessionsByBatch,
  deleteWeeklyCheckinsByBatch
} = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const payload = parseJsonBody(event);
    const athleteId = payload.athleteId;
    if (!athleteId) {
      return json(400, { error: "Missing athleteId" });
    }

    const config = getConfig();
    let uploadBatchId = deriveUploadBatchId({
      athleteId,
      sourceFileName: payload.sourceFileName,
      uploadBatchId: payload.uploadBatchId
    });

    if (!payload.uploadBatchId && !payload.sourceFileName) {
      uploadBatchId = await getLatestUploadBatchId(config, athleteId);
      if (!uploadBatchId) {
        return json(404, { error: "Nenhum upload batch encontrado para este atleta" });
      }
    }

    const checkin = await getWeeklyCheckinByBatch(config, athleteId, uploadBatchId);
    if (checkin && (checkin.responded_at || checkin.approved_at)) {
      return json(409, {
        error: "Nao e possivel cancelar: o atleta ja respondeu ou o check-in ja foi aprovado",
        uploadBatchId
      });
    }

    const deletedSessions = await deleteTrainingSessionsByBatch(config, athleteId, uploadBatchId);
    const deletedCheckins = await deleteWeeklyCheckinsByBatch(config, athleteId, uploadBatchId);

    return json(200, {
      status: "ok",
      uploadBatchId,
      deletedSessions,
      deletedCheckins
    });
  } catch (err) {
    return json(500, { error: err.message || "Falha a cancelar upload" });
  }
};
