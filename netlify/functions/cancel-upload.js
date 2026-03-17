const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { deriveUploadBatchId } = require("./_lib/upload-batch");
const {
  getLatestUploadBatchId,
  getWeeklyCheckinByBatch,
  deleteTrainingSessionsByBatch,
  deleteWeeklyCheckinsByBatch,
  verifyCoachOwnsAthlete
} = require("./_lib/supabase");
const { getAuthenticatedUser } = require("./_lib/auth-identity");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);
    
    if (!user) {
      return json(401, { error: "Authentication required" });
    }

    const coachId = user.sub;
    const payload = parseJsonBody(event);
    const athleteId = payload.athleteId;
    
    if (!athleteId) {
      return json(400, { error: "Missing athleteId" });
    }

    const owns = await verifyCoachOwnsAthlete(config, coachId, athleteId);
    if (!owns) {
      return json(403, { error: "Acesso negado ao atleta" });
    }

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
