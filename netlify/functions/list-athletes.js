const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { listAthletesByCoach, listAllAthletesForAdmin, getPayingStatusForAthletes } = require("./_lib/supabase");
const { requireAuthenticatedUser } = require("./_lib/authz");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const roles = Array.isArray(auth.roles) ? auth.roles : [];
    const isAdmin = roles.includes("admin");
    const isCoach = roles.includes("coach");
    if (!isAdmin && !isCoach) {
      return json(403, { error: "Forbidden" });
    }

    const athletes = isAdmin
      ? await listAllAthletesForAdmin(config)
      : await listAthletesByCoach(config, auth.user.sub);
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
          label: athlete.name || athlete.email || athlete.id,
          isPaying: paying ? paying.isPaying : false,
          billingType: paying ? paying.billingType : null,
          paidAt: paying ? paying.paidAt : null,
          expiresAt: paying ? paying.expiresAt : null
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label, "pt"));

    return json(200, { athletes: normalized });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao carregar atletas" });
  }
};