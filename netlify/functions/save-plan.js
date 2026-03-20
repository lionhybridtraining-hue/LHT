const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { getAuthenticatedUser } = require("./_lib/auth-supabase");

/**
 * Saves a generated training plan to the athlete's program assignment
 * 
 * Expected POST body:
 * {
 *   plan_data: { phase1: {...}, phase2: {...}, phase3: {...} },
 *   plan_params: {
 *     vdot: number,
 *     level: string,
 *     progression_rate: number,
 *     phase_duration: number,
 *     training_frequency: number,
 *     program_distance: number,
 *     race_dist: number,
 *     race_time: number,
 *     initial_volume?: number,
 *     athlete_name?: string
 *   }
 * }
 */
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

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (err) {
      return json(400, { error: "Invalid JSON body" });
    }

    const { plan_data, plan_params } = body;

    if (!plan_data) {
      return json(400, { error: "plan_data is required" });
    }

    if (!plan_params) {
      return json(400, { error: "plan_params is required" });
    }

    // Get the athlete ID from the user (stored in sub field of JWT)
    const athleteId = user.sub;

    // Get the active program assignment for this athlete
    const programAssignment = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `program_assignments?athlete_id=eq.${encodeURIComponent(athleteId)}&status=in.("scheduled","active","paused")&select=id&order=created_at.desc&limit=1`
    });

    if (!Array.isArray(programAssignment) || !programAssignment.length) {
      return json(404, { error: "No active program assignment found for athlete" });
    }

    const assignmentId = programAssignment[0].id;

    // Update the program_assignments table with plan data
    const updateResult = await supabaseRequest({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
      path: `program_assignments?id=eq.${encodeURIComponent(assignmentId)}`,
      method: "PATCH",
      body: {
        plan_data: plan_data,
        plan_params: plan_params,
        plan_generated_at: new Date().toISOString()
      }
    });

    return json(200, {
      success: true,
      message: "Plan saved successfully",
      assignment_id: assignmentId,
      plan_params: plan_params
    });

  } catch (err) {
    console.error("Error saving plan:", err);
    return json(500, { error: err.message || "Error saving plan" });
  }
};

// Helper function (copied from supabase.js)
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
