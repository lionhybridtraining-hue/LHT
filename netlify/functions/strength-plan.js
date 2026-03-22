const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  listStrengthPlansForAthlete,
  getStrengthPlanFull,
  getActivePlanForAthlete,
  createStrengthPlan,
  updateStrengthPlan,
  upsertStrengthPlanExercises,
  deleteStrengthPlanExercises,
  upsertStrengthPrescriptions,
  upsertStrengthPlanPhaseNotes,
  verifyCoachOwnsAthlete,
  getStrengthPlanById
} = require("./_lib/supabase");

exports.handler = async (event) => {
  const config = getConfig();
  const auth = await requireRole(event, config, "coach");
  if (auth.error) return auth.error;

  const coachId = auth.user.sub;

  try {
    // GET — fetch plan(s) for an athlete
    if (event.httpMethod === "GET") {
      const qs = event.queryStringParameters || {};
      const athleteId = qs.athleteId;
      if (!athleteId) return json(400, { error: "athleteId is required" });

      await verifyCoachOwnsAthlete(config, coachId, athleteId);

      // If planId provided, return full plan; otherwise list all plans
      if (qs.planId) {
        const full = await getStrengthPlanFull(config, qs.planId);
        if (!full || full.plan.athlete_id !== athleteId) {
          return json(404, { error: "Plan not found" });
        }
        return json(200, full);
      }

      const plans = await listStrengthPlansForAthlete(config, athleteId);
      return json(200, { plans: plans || [] });
    }

    // POST — create new plan
    if (event.httpMethod === "POST") {
      const body = parseJsonBody(event);
      if (!body.athlete_id || !body.name || !body.total_weeks) {
        return json(400, { error: "athlete_id, name, total_weeks are required" });
      }

      await verifyCoachOwnsAthlete(config, coachId, body.athlete_id);

      const plan = await createStrengthPlan(config, {
        athlete_id: body.athlete_id,
        name: body.name,
        total_weeks: body.total_weeks,
        load_round: body.load_round != null ? body.load_round : 2.5,
        start_date: body.start_date || null,
        status: "draft",
        created_by: coachId
      });
      return json(201, { plan });
    }

    // PUT — upsert exercises + prescriptions + phase notes
    if (event.httpMethod === "PUT") {
      const body = parseJsonBody(event);
      if (!body.plan_id) return json(400, { error: "plan_id is required" });

      const plan = await getStrengthPlanById(config, body.plan_id);
      if (!plan) return json(404, { error: "Plan not found" });
      await verifyCoachOwnsAthlete(config, coachId, plan.athlete_id);

      // Delete removed exercises
      if (body.delete_exercise_ids && body.delete_exercise_ids.length > 0) {
        await deleteStrengthPlanExercises(config, body.delete_exercise_ids);
      }

      // Upsert exercises
      if (body.exercises && body.exercises.length > 0) {
        await upsertStrengthPlanExercises(config, body.exercises);
      }

      // Upsert prescriptions
      if (body.prescriptions && body.prescriptions.length > 0) {
        await upsertStrengthPrescriptions(config, body.prescriptions);
      }

      // Upsert phase notes
      if (body.phase_notes && body.phase_notes.length > 0) {
        await upsertStrengthPlanPhaseNotes(config, body.phase_notes);
      }

      // Return refreshed full plan
      const full = await getStrengthPlanFull(config, body.plan_id);
      return json(200, full);
    }

    // PATCH — status change or plan metadata update
    if (event.httpMethod === "PATCH") {
      const body = parseJsonBody(event);
      if (!body.plan_id) return json(400, { error: "plan_id is required" });

      const plan = await getStrengthPlanById(config, body.plan_id);
      if (!plan) return json(404, { error: "Plan not found" });
      await verifyCoachOwnsAthlete(config, coachId, plan.athlete_id);

      const allowed = ["name", "total_weeks", "load_round", "start_date", "status"];
      const patch = {};
      for (const key of allowed) {
        if (body[key] !== undefined) patch[key] = body[key];
      }

      const updated = await updateStrengthPlan(config, body.plan_id, patch);
      return json(200, { plan: updated });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const status = err.status || 500;
    return json(status, { error: err.message || "Internal server error" });
  }
};
