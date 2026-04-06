const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");

async function supabaseRequest({ url, serviceRoleKey, path, method = "GET" }) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    }
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message = payload && payload.message ? payload.message : `Supabase error ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function getAthleteStatus(config, identityId) {
  // Get athlete profile with onboarding status
  const athletes = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?identity_id=eq.${encodeURIComponent(identityId)}&select=id,onboarding_submitted_at,onboarding_answers&limit=1`
  });
  return Array.isArray(athletes) ? athletes[0] || null : null;
}

async function hasActivePurchase(config, identityId) {
  // Check if user has any completed purchase (status = 'paid' or 'completed')
  const purchases = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?identity_id=eq.${encodeURIComponent(identityId)}&status=in.("paid","completed")&select=id&limit=1`
  });
  return Array.isArray(purchases) && purchases.length > 0;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const user = await getAuthenticatedUser(event, config);
    if (!user || !user.id) {
      return json(401, { error: "Authentication required" });
    }

    const athlete = await getAthleteStatus(config, user.id);
    const hasPurchase = await hasActivePurchase(config, user.id);

    // Determine notification state
    let notification = null;

    // Show notification if:
    // 1. User has a purchase
    // 2. User has NOT completed onboarding (onboarding_submitted_at is null)
    // 3. User has NOT dismissed this notification
    if (hasPurchase && (!athlete || !athlete.onboarding_submitted_at)) {
      const hasIntakeAnswers = athlete?.onboarding_answers && Object.keys(athlete.onboarding_answers).length > 0;

      notification = {
        type: "onboarding_pending",
        title: "Completa o teu Onboarding",
        message: hasIntakeAnswers
          ? "Tu tens respostas guardadas! Clica aqui para terminar o teu onboarding e começar a treinar."
          : "Para desbloqueares todo o potencial do teu programa, completa o teu onboarding agora.",
        action: "Complete Onboarding",
        actionUrl: "/onboarding",
        severity: "info",
        dismissible: true,
        storageKey: "lht_onboarding_notification_dismissed"
      };
    }

    return json(200, {
      ok: true,
      notification: notification,
      athleteStatus: {
        hasOnboarded: athlete ? !!athlete.onboarding_submitted_at : false,
        hasPurchase: hasPurchase,
        hasPartialAnswers: athlete ? Object.keys(athlete.onboarding_answers || {}).length > 0 : false
      }
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao verificar notificacoes" });
  }
};
