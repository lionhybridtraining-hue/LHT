async function supabaseRequest({ url, serviceRoleKey, path, method = "GET", body, prefer }) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: prefer || "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (err) {
    payload = text;
  }

  if (!response.ok) {
    const message = payload && payload.message ? payload.message : `Supabase error ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function insertTrainingSessions(config, sessions) {
  if (!sessions.length) return [];
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "training_sessions?on_conflict=athlete_id,session_date,title,sport_type",
    method: "POST",
    body: sessions,
    prefer: "resolution=merge-duplicates,return=representation"
  });
}

async function getAthleteById(config, athleteId) {
  const result = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?id=eq.${encodeURIComponent(athleteId)}&select=*`
  });
  return Array.isArray(result) ? result[0] || null : null;
}

async function listAthletes(config) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "athletes?select=id,name,email&limit=200"
  });
}

async function createAthlete(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "athletes",
    method: "POST",
    body: [payload]
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getWeekSessions(config, athleteId, weekStart, weekEnd) {
  return supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}&session_date=gte.${weekStart}&session_date=lte.${weekEnd}&order=session_date.asc`
  });
}

async function createWeeklyCheckin(config, payload) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: "weekly_checkins",
    method: "POST",
    body: [payload]
  });
  return Array.isArray(rows) ? rows[0] : null;
}

async function getWeeklyCheckinByToken(config, token) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `weekly_checkins?token=eq.${encodeURIComponent(token)}&select=*`
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateWeeklyCheckin(config, id, patch) {
  const rows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `weekly_checkins?id=eq.${encodeURIComponent(id)}`,
    method: "PATCH",
    body: patch
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

module.exports = {
  insertTrainingSessions,
  getAthleteById,
  listAthletes,
  createAthlete,
  getWeekSessions,
  createWeeklyCheckin,
  getWeeklyCheckinByToken,
  updateWeeklyCheckin
};
