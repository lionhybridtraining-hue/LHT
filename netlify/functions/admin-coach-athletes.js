const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listAthletesByCoach, listCoaches, getPayingStatusForAthletes } = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const coachIdentityId = (event.queryStringParameters || {}).coachIdentityId || "";
    if (!coachIdentityId) {
      return json(400, { error: "coachIdentityId query param is required" });
    }

    const athletes = await listAthletesByCoach(config, coachIdentityId);
    const list = Array.isArray(athletes) ? athletes : [];

    const identityIds = list
      .map((a) => a.identity_id)
      .filter((id) => typeof id === "string" && id.length > 0);
    const payingMap = await getPayingStatusForAthletes(config, identityIds);

    const normalized = list
      .map((athlete) => {
        const paying = athlete.identity_id ? payingMap[athlete.identity_id] || null : null;
        return {
          id: athlete.id,
          name: athlete.name || "",
          email: athlete.email || "",
          isPaying: paying ? paying.isPaying : false,
          billingType: paying ? paying.billingType : null,
          paidAt: paying ? paying.paidAt : null,
          expiresAt: paying ? paying.expiresAt : null
        };
      })
      .sort((left, right) => {
        if (left.isPaying !== right.isPaying) return left.isPaying ? -1 : 1;
        return (left.name || left.email || "").localeCompare(right.name || right.email || "", "pt");
      });

    const payingCount = normalized.filter((a) => a.isPaying).length;

    return json(200, {
      athletes: normalized,
      total: normalized.length,
      payingCount
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao listar atletas do coach" });
  }
};
