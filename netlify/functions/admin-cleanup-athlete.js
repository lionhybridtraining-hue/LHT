/**
 * Endpoint: admin-cleanup-athlete
 * 
 * Removes ALL athlete data for a given email.
 * Useful for resetting test accounts (rodrigolibanio1999@gmail.com).
 * 
 * Routes:
 *   POST - trigger cleanup for email in body
 *   GET  - show cleanup operation details (no actual deletion)
 * 
 * Required role: admin
 */

const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { supabaseRequest } = require("./_lib/supabase");

/**
 * Delete all athlete data via manual SQL deletion queries
 */
async function cleanupAthleteData(config, email) {
  const normalizedEmail = (email || "").trim().toLowerCase();
  
  if (!normalizedEmail) {
    throw new Error("Email is required");
  }

  // Verify this email exists in our test account allowlist
  const ALLOWED_TEST_ACCOUNTS = ["rodrigolibanio1999@gmail.com"];
  if (!ALLOWED_TEST_ACCOUNTS.includes(normalizedEmail)) {
    throw new Error(`Cleanup only allowed for test accounts: ${ALLOWED_TEST_ACCOUNTS.join(", ")}`);
  }

  console.log(`[admin-cleanup-athlete] Starting cleanup for: ${normalizedEmail}`);

  /**
   * Get athlete ID first
   */
  const athleteRows = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?email=eq.${encodeURIComponent(normalizedEmail)}&select=id,email,identity_id`
  });

  if (!Array.isArray(athleteRows) || athleteRows.length === 0) {
    return {
      found: false,
      deletedCounts: {}
    };
  }

  const athlete = athleteRows[0];
  const athleteId = athlete.id;
  const identityId = athlete.identity_id;

  console.log(`[admin-cleanup-athlete] Found athlete: ${athleteId} (${normalizedEmail})`);

  const deletedCounts = {};

  // Delete in dependency order (most dependent first)

  // 1. leads_central
  const leadsResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `leads_central?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE",
    prefer: "return=representation"
  });
  deletedCounts.leads_central = Array.isArray(leadsResult) ? leadsResult.length : 0;

  // Also delete by identity_id if available
  if (identityId) {
    const leadsByIdentityResult = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `leads_central?identity_id=eq.${encodeURIComponent(identityId)}`,
      method: "DELETE",
      prefer: "return=representation"
    });
    deletedCounts.leads_central += Array.isArray(leadsByIdentityResult) ? leadsByIdentityResult.length : 0;
  }

  // 2. ai_logs
  const aiLogsResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `ai_logs?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE",
    prefer: "return=representation"
  });
  deletedCounts.ai_logs = Array.isArray(aiLogsResult) ? aiLogsResult.length : 0;

  // 3. strength_log_sets
  const strengthLogResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_log_sets?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE",
    prefer: "return=representation"
  });
  deletedCounts.strength_log_sets = Array.isArray(strengthLogResult) ? strengthLogResult.length : 0;

  // 4. athlete_weekly_plan
  const weeklyPlanResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_weekly_plan?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE",
    prefer: "return=representation"
  });
  deletedCounts.athlete_weekly_plan = Array.isArray(weeklyPlanResult) ? weeklyPlanResult.length : 0;

  // 5. strength_plan_instances
  const strengthInstanceResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `strength_plan_instances?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE",
    prefer: "return=representation"
  });
  deletedCounts.strength_plan_instances = Array.isArray(strengthInstanceResult) ? strengthInstanceResult.length : 0;

  // 6. program_assignments
  const assignmentsResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `program_assignments?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE",
    prefer: "return=representation"
  });
  deletedCounts.program_assignments = Array.isArray(assignmentsResult) ? assignmentsResult.length : 0;

  // 7. stripe_purchases (current schema uses identity_id/email, no athlete_id)
  deletedCounts.stripe_purchases = 0;
  if (identityId) {
    const stripeByIdentityResult = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `stripe_purchases?identity_id=eq.${encodeURIComponent(identityId)}`,
      method: "DELETE",
      prefer: "return=representation"
    });
    deletedCounts.stripe_purchases += Array.isArray(stripeByIdentityResult) ? stripeByIdentityResult.length : 0;
  }

  const stripeByEmailResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `stripe_purchases?email=ilike.${encodeURIComponent(normalizedEmail)}`,
    method: "DELETE",
    prefer: "return=representation"
  });
  deletedCounts.stripe_purchases += Array.isArray(stripeByEmailResult) ? stripeByEmailResult.length : 0;

  // 8. weekly_checkins
  const checkinsResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `weekly_checkins?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE",
    prefer: "return=representation"
  });
  deletedCounts.weekly_checkins = Array.isArray(checkinsResult) ? checkinsResult.length : 0;

  // 9. training_sessions
  const sessionsResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `training_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE",
    prefer: "return=representation"
  });
  deletedCounts.training_sessions = Array.isArray(sessionsResult) ? sessionsResult.length : 0;

  // 10. athlete_strava_connections (legacy fallback: strava_connections)
  const stravaResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_strava_connections?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE",
    prefer: "return=representation"
  }).catch(() => null);

  if (Array.isArray(stravaResult)) {
    deletedCounts.athlete_strava_connections = stravaResult.length;
  } else {
    const legacyStravaResult = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `strava_connections?athlete_id=eq.${encodeURIComponent(athleteId)}`,
      method: "DELETE",
      prefer: "return=representation"
    }).catch(() => []);
    deletedCounts.athlete_strava_connections = Array.isArray(legacyStravaResult) ? legacyStravaResult.length : 0;
  }

  // 11. onboarding_intake (if exists)
  const onboardingResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `onboarding_intake?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE",
    prefer: "return=representation"
  }).catch(() => []);
  deletedCounts.onboarding_intake = Array.isArray(onboardingResult) ? onboardingResult.length : 0;

  // 12. athlete_training_zone_profiles + cascading athlete_training_zones
  const zoneProfilesResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athlete_training_zone_profiles?athlete_id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE",
    prefer: "return=representation"
  });
  deletedCounts.athlete_training_zone_profiles = Array.isArray(zoneProfilesResult) ? zoneProfilesResult.length : 0;
  // athlete_training_zones cascade via FK

  // 13. Finally, delete the athlete record
  const athleteResult = await supabaseRequest({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
    path: `athletes?id=eq.${encodeURIComponent(athleteId)}`,
    method: "DELETE",
    prefer: "return=representation"
  });
  deletedCounts.athletes = Array.isArray(athleteResult) ? athleteResult.length : 0;

  console.log(`[admin-cleanup-athlete] Cleanup completed for ${normalizedEmail}:`, JSON.stringify(deletedCounts));

  return {
    found: true,
    deletedCounts
  };
}

exports.handler = async (event) => {
  const isGet = event.httpMethod === "GET";
  const isPost = event.httpMethod === "POST";

  if (!isGet && !isPost) {
    return json(405, { error: "Method not allowed. Use GET or POST." });
  }

  try {
    const config = getConfig();
    
    // Require admin role
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    if (isGet) {
      // GET: Show cleanup info without actually deleting
      return json(200, {
        message: "POST with {email} body to trigger cleanup",
        allowed_test_accounts: ["rodrigolibanio1999@gmail.com"],
        requires_role: "admin"
      });
    }

    // POST: Trigger cleanup
    const payload = parseJsonBody(event);
    const email = (payload.email || "").trim().toLowerCase();

    if (!email) {
      return json(400, { error: "email is required in request body" });
    }

    const result = await cleanupAthleteData(config, email);

    if (!result.found) {
      return json(404, { error: `Athlete not found: ${email}` });
    }

    return json(200, {
      success: true,
      message: `Athlete cleanup completed: ${email}`,
      deletedCounts: result.deletedCounts
    });
  } catch (err) {
    console.error("[admin-cleanup-athlete] Error:", err);
    return json(500, { error: err.message || "Internal server error" });
  }
};
