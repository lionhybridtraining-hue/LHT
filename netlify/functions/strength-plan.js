const { json, parseJsonBody } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { getProgramAssociationAccess } = require("./_lib/program-access");
const {
  listStrengthPlans,
  getStrengthPlanFull,
  createStrengthPlan,
  updateStrengthPlan,
  upsertStrengthPlanExercises,
  deleteStrengthPlanExercises,
  upsertStrengthPrescriptions,
  upsertStrengthPlanPhaseNotes,
  getStrengthPlanById,
  listStrengthPlanInstances,
  createStrengthPlanInstance,
  updateStrengthPlanInstance,
  getStrengthPlanInstanceById,
  getActiveInstanceForAthlete,
  verifyCoachOwnsAthlete,
  getAthleteById
} = require("./_lib/supabase");

exports.handler = async (event) => {
  const config = getConfig();
  const auth = await requireAuthenticatedUser(event, config);
  if (auth.error) return auth.error;

  const roles = Array.isArray(auth.roles) ? auth.roles : [];
  const isCoach = roles.includes("coach");
  const isAdmin = roles.includes("admin");
  if (!isCoach && !isAdmin) {
    return json(403, { error: "Forbidden" });
  }

  const coachId = auth.user.sub;

  try {
    const qs = event.queryStringParameters || {};

    // ── GET ──
    if (event.httpMethod === "GET") {
      // ?instances=1&athleteId=X&planId=X → list instances
      if (qs.instances === "1") {
        const filters = {};
        if (qs.athleteId) filters.athleteId = qs.athleteId;
        if (qs.planId) filters.planId = qs.planId;
        if (qs.status) filters.status = qs.status;
        const instances = await listStrengthPlanInstances(config, filters);
        return json(200, { instances: instances || [] });
      }

      // ?activeInstance=1&athleteId=X → get active instance for athlete
      if (qs.activeInstance === "1" && qs.athleteId) {
        const instance = await getActiveInstanceForAthlete(config, qs.athleteId);
        return json(200, { instance });
      }

      // ?planId=X → full plan template detail
      if (qs.planId) {
        const full = await getStrengthPlanFull(config, qs.planId);
        if (!full) return json(404, { error: "Plan not found" });
        return json(200, full);
      }

      // Default: list plan templates
      const filters = {};
      if (qs.status) filters.status = qs.status;
      if (qs.trainingProgramId) filters.trainingProgramId = qs.trainingProgramId;
      const plans = await listStrengthPlans(config, filters);
      return json(200, { plans: plans || [] });
    }

    // ── POST ──
    if (event.httpMethod === "POST") {
      const body = parseJsonBody(event);

      // POST with action=assign → create instance (assign plan to athlete)
      if (body.action === "assign") {
        if (!body.plan_id || !body.athlete_id) {
          return json(400, { error: "plan_id and athlete_id are required" });
        }
        if (!isAdmin) {
          const owns = await verifyCoachOwnsAthlete(config, coachId, body.athlete_id);
          if (!owns) return json(403, { error: "Forbidden" });
        }

        const planTemplate = await getStrengthPlanById(config, body.plan_id);
        if (!planTemplate) {
          return json(404, { error: "Plan not found" });
        }

        if (!planTemplate.training_program_id) {
          return json(409, { error: "Plan is not linked to a training program" });
        }

        const athlete = await getAthleteById(config, body.athlete_id);
        if (!athlete) {
          return json(404, { error: "Athlete not found" });
        }

        const access = await getProgramAssociationAccess(config, {
          athleteId: athlete.id,
          identityId: athlete.identity_id || null,
          programId: planTemplate.training_program_id
        });
        if (!access.hasAccess) {
          return json(403, {
            error: "Athlete has no associated access to this training program",
            code: access.reason
          });
        }

        // Phase 5.1 — Snapshot plan data at assignment time
        let planSnapshot = null;
        try {
          const full = await getStrengthPlanFull(config, body.plan_id);
          if (full) {
            planSnapshot = {
              exercises: full.exercises,
              prescriptions: full.prescriptions,
              phaseNotes: full.phaseNotes || []
            };
          }
        } catch (_) { /* best-effort — fall back to live data */ }

        const instance = await createStrengthPlanInstance(config, {
          plan_id: body.plan_id,
          athlete_id: body.athlete_id,
          start_date: body.start_date || null,
          load_round: body.load_round != null ? body.load_round : 2.5,
          status: "active",
          assigned_by: coachId,
          access_model: access.program?.access_model || planTemplate.access_model || null,
          stripe_purchase_id: access.purchase?.id || null,
          program_assignment_id: access.assignment?.id || null,
          coach_locked_until: access.assignment?.computed_end_date || null,
          plan_snapshot: planSnapshot ? JSON.stringify(planSnapshot) : null
        });
        return json(201, { instance });
      }

      // POST default: create new plan template
      if (!body.name || !body.total_weeks) {
        return json(400, { error: "name and total_weeks are required" });
      }
      const plan = await createStrengthPlan(config, {
        name: body.name,
        description: body.description || null,
        total_weeks: body.total_weeks,
        start_date: body.start_date || null,
        training_program_id: body.training_program_id || null,
        status: "draft",
        created_by: coachId
      });
      return json(201, { plan });
    }

    // ── PUT — upsert exercises + prescriptions + phase notes ──
    if (event.httpMethod === "PUT") {
      const body = parseJsonBody(event);
      if (!body.plan_id) return json(400, { error: "plan_id is required" });

      const plan = await getStrengthPlanById(config, body.plan_id);
      if (!plan) return json(404, { error: "Plan not found" });

      if (body.delete_exercise_ids && body.delete_exercise_ids.length > 0) {
        await deleteStrengthPlanExercises(config, body.delete_exercise_ids);
      }
      if (body.exercises && body.exercises.length > 0) {
        await upsertStrengthPlanExercises(config, body.exercises);
      }
      if (body.prescriptions && body.prescriptions.length > 0) {
        await upsertStrengthPrescriptions(config, body.prescriptions);
      }
      if (body.phase_notes && body.phase_notes.length > 0) {
        await upsertStrengthPlanPhaseNotes(config, body.phase_notes);
      }

      const full = await getStrengthPlanFull(config, body.plan_id);
      return json(200, full);
    }

    // ── PATCH — update plan template metadata OR instance status ──
    if (event.httpMethod === "PATCH") {
      const body = parseJsonBody(event);

      // Patch instance
      if (body.instance_id) {
        const inst = await getStrengthPlanInstanceById(config, body.instance_id);
        if (!inst) return json(404, { error: "Instance not found" });
        if (!isAdmin) {
          const owns = await verifyCoachOwnsAthlete(config, coachId, inst.athlete_id);
          if (!owns) return json(403, { error: "Forbidden" });
        }

        const requestedStatus = body.status !== undefined
          ? (body.status || "").toString().trim()
          : null;
        const allowAdminOverride = Boolean(body.allow_admin_override);
        if (
          requestedStatus === "active" &&
          inst.access_model === "coached_recurring" &&
          !(isAdmin && allowAdminOverride)
        ) {
          return json(403, {
            error: "Recurring coached instances are resumed automatically by subscription lifecycle"
          });
        }

        const allowedInst = ["status", "start_date", "load_round"];
        const patch = {};
        for (const key of allowedInst) {
          if (body[key] !== undefined) patch[key] = body[key];
        }
        const updated = await updateStrengthPlanInstance(config, body.instance_id, patch);
        return json(200, { instance: updated });
      }

      // Patch plan template
      if (!body.plan_id) return json(400, { error: "plan_id or instance_id is required" });
      const plan = await getStrengthPlanById(config, body.plan_id);
      if (!plan) return json(404, { error: "Plan not found" });

      const allowed = ["name", "description", "total_weeks", "start_date", "status", "training_program_id"];
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
