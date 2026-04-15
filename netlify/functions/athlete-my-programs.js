/**
 * Endpoint: athlete-my-programs
 *
 * Returns a consolidated view of an athlete's purchased programs and their
 * associated strength plan instances.
 *
 * Each program entry includes:
 *   - purchase: the Stripe purchase record (status, billing type, grace period)
 *   - program: training program metadata (name, access_model)
 *   - instance: the linked strength plan instance if one exists
 *   - phase: derived state for easy UI rendering
 *       'coached'    — within the coaching period (athlete cannot self-manage)
 *       'self_serve' — coaching period ended or program is self-serve; athlete manages freely
 *       'active'     — recurring subscription active
 *       'grace'      — payment failed but within grace period (access maintained)
 *       'expired'    — no valid access (subscription lapsed beyond grace)
 *       'cancelled'  — purchase cancelled
 *   - isCoachLocked: true if athlete cannot change the instance status today
 *   - canCreateInstance: true if athlete may start a new instance now
 *
 * Routes:
 *   GET — returns { programs, orphanedInstances }
 *         programs: entries derived from purchases
 *         orphanedInstances: instances with no linked stripe_purchase_id (coach ad-hoc assignments)
 */

const { requireAuthenticatedUser } = require("./_lib/authz");
const { getConfig } = require("./_lib/config");
const { json } = require("./_lib/http");
const {
  getAthleteByIdentity,
  getStripePurchasesForIdentity,
  getAllInstancesForAthlete,
  getActiveAssignmentsForAthlete,
  listStrengthPlans,
  listPaymentPlans,
  listPaymentCharges
} = require("./_lib/supabase");

function derivePhasedPaymentState(charges) {
  if (!Array.isArray(charges) || !charges.length) return { status: "none" };

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const paid = charges.filter((c) => c.status === "paid").length;
  const overdue = charges.filter((c) => c.status === "overdue");
  const failed = charges.filter((c) => c.status === "failed");

  // Any overdue charge with expired grace = blocked
  const overdueBlocked = overdue.some((c) => {
    if (!c.grace_period_ends_at) return true;
    return new Date(c.grace_period_ends_at) < new Date(now);
  });

  if (overdueBlocked) return { status: "blocked", paid, overdue: overdue.length };

  // Failed charges still within grace = grace state
  const inGrace = [...overdue, ...failed].some((c) =>
    c.grace_period_ends_at && new Date(c.grace_period_ends_at) >= new Date(now)
  );

  if (inGrace) return { status: "grace", paid, overdue: overdue.length };

  // All paid/skipped/cancelled = complete
  const allDone = charges.every((c) =>
    c.status === "paid" || c.status === "skipped" || c.status === "cancelled"
  );
  if (allDone) return { status: "complete", paid };

  return { status: "active", paid, total: charges.length };
}

function derivePurchasePhase({ purchase, instance, isCoachLocked, isInGrace, phasedState }) {
  if (purchase.status === "cancelled") return "cancelled";
  if (purchase.status === "payment_failed" && !isInGrace) return "expired";
  if (purchase.status === "payment_failed" && isInGrace) return "grace";

  // Phased payment gating
  if (phasedState && phasedState.status === "blocked") return "expired";
  if (phasedState && phasedState.status === "grace") return "grace";

  if (isCoachLocked) return "coached";

  const accessModel = (instance && instance.access_model) ||
    (purchase.training_programs && purchase.training_programs.access_model) || null;

  if (accessModel === "coached_one_time") return "self_serve"; // coaching period ended
  return "active";
}

function deriveAssignmentPhase({ assignment, instance, isCoachLocked }) {
  if (assignment.status === "paused") return "self_serve";
  if (isCoachLocked) return "coached";
  if (instance && instance.access_model === "coached_one_time") return "self_serve";
  return "active";
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const identityId = auth.user.sub;
    const athlete = await getAthleteByIdentity(config, identityId);
    if (!athlete) {
      return json(403, { error: "No athlete profile found for this account" });
    }

    const [purchases, allInstances, assignments] = await Promise.all([
      getStripePurchasesForIdentity(config, identityId),
      getAllInstancesForAthlete(config, athlete.id),
      getActiveAssignmentsForAthlete(config, athlete.id)
    ]);

    // Load phased payment plans for this identity
    const phasedPlans = await listPaymentPlans(config, { identityId, status: undefined, limit: 100 });
    const phasedChargesByPurchaseId = {};
    for (const plan of phasedPlans) {
      if (plan.stripe_purchase_id) {
        const charges = await listPaymentCharges(config, { paymentPlanId: plan.id });
        phasedChargesByPurchaseId[plan.stripe_purchase_id] = charges;
      }
    }

    // Index instances by stripe_purchase_id and program_assignment_id for O(1) lookup
    const instanceByPurchaseId = {};
    const instanceByAssignmentId = {};
    const claimedInstanceIds = new Set();

    for (const inst of allInstances) {
      if (inst.stripe_purchase_id) {
        if (!instanceByPurchaseId[inst.stripe_purchase_id]) {
          instanceByPurchaseId[inst.stripe_purchase_id] = inst;
          claimedInstanceIds.add(inst.id);
        }
      } else if (inst.program_assignment_id) {
        if (!instanceByAssignmentId[inst.program_assignment_id]) {
          instanceByAssignmentId[inst.program_assignment_id] = inst;
          claimedInstanceIds.add(inst.id);
        }
      }
    }

    // Instances that are also covered by a purchase via training_program_id match
    // (some auto-created instances may not have program_assignment_id set but belong to an assignment's program)
    const assignmentProgramIds = new Set(assignments.map((a) => a.training_program_id));

    const orphanedInstances = [];
    for (const inst of allInstances) {
      if (!claimedInstanceIds.has(inst.id)) {
        // If the instance's plan belongs to a program covered by an assignment, wire it up
        const instProgramId = inst.plan && inst.plan.training_program_id ? inst.plan.training_program_id : null;
        if (instProgramId && assignmentProgramIds.has(instProgramId)) {
          // Find the matching assignment and claim this instance
          const matchingAssignment = assignments.find((a) => a.training_program_id === instProgramId);
          if (matchingAssignment && !instanceByAssignmentId[matchingAssignment.id]) {
            instanceByAssignmentId[matchingAssignment.id] = inst;
            claimedInstanceIds.add(inst.id);
          } else if (!matchingAssignment) {
            orphanedInstances.push(inst);
          }
        } else {
          orphanedInstances.push(inst);
        }
      }
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const templatesByProgramId = {};

    // ── Purchase-based program entries ──
    const purchasePrograms = purchases.map((purchase) => {
      const instance = instanceByPurchaseId[purchase.id] || null;
      const programMeta = purchase.training_programs || null;

      const isCoachLocked = !!(
        instance &&
        instance.coach_locked_until &&
        instance.coach_locked_until >= today
      );

      const isInGrace = !!(
        purchase.grace_period_ends_at &&
        purchase.grace_period_ends_at > now
      );

      const phasedCharges = phasedChargesByPurchaseId[purchase.id] || null;
      const phasedState = phasedCharges ? derivePhasedPaymentState(phasedCharges) : null;

      const phase = derivePurchasePhase({ purchase, instance, isCoachLocked, isInGrace, phasedState });

      const canCreateInstance =
        purchase.status === "paid" || isInGrace
          ? (!instance || instance.status === "cancelled" || instance.status === "completed")
          : false;

      const templates = templatesByProgramId[purchase.program_id] || [];

      return {
        purchase: {
          id: purchase.id,
          programId: purchase.program_id,
          billingType: purchase.billing_type,
          status: purchase.status,
          paidAt: purchase.paid_at || null,
          expiresAt: purchase.expires_at || null,
          gracePeriodEndsAt: purchase.grace_period_ends_at || null
        },
        program: programMeta
          ? {
              id: programMeta.id,
              name: programMeta.name,
              accessModel: programMeta.access_model,
              classification: programMeta.classification || null,
              durationWeeks: programMeta.duration_weeks,
              billingType: programMeta.billing_type,
              presetSelection: programMeta.preset_selection || 'coach'
            }
          : null,
        instance: instance
          ? {
              id: instance.id,
              status: instance.status,
              startDate: instance.start_date || null,
              coachLockedUntil: instance.coach_locked_until || null,
              accessModel: instance.access_model || null,
              planName: instance.plan ? instance.plan.name : null
            }
          : null,
        phase,
        isCoachLocked,
        isInGrace,
        canCreateInstance,
        assignment: null,
        sourceType: "purchase",
        availableTemplates: templates
      };
    });

    // ── Assignment-based program entries (coach-assigned, no Stripe) ──
    // Deduplicate: skip assignments whose program is already covered by a purchase
    const purchaseProgramIds = new Set(purchases.map((p) => p.program_id).filter(Boolean));

    // Collect unique program IDs from assignments that need template lookups
    const assignmentProgramIdsForTemplates = new Set();
    for (const a of assignments) {
      if (!purchaseProgramIds.has(a.training_program_id)) {
        assignmentProgramIdsForTemplates.add(a.training_program_id);
      }
    }

    // Also collect program IDs from purchases that have no instance yet
    for (const purchase of purchases) {
      const instance = instanceByPurchaseId[purchase.id] || null;
      if (!instance || instance.status === "cancelled" || instance.status === "completed") {
        if (purchase.program_id) assignmentProgramIdsForTemplates.add(purchase.program_id);
      }
    }

    // Fetch templates for all relevant programs in parallel
    if (assignmentProgramIdsForTemplates.size > 0) {
      const templateFetches = [...assignmentProgramIdsForTemplates].map(async (programId) => {
        const plans = await listStrengthPlans(config, { trainingProgramId: programId });
        const active = (Array.isArray(plans) ? plans : []).filter((p) =>
          p.status === "active" || p.status === "draft"
        );
        templatesByProgramId[programId] = active.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || null,
          totalWeeks: p.total_weeks,
          status: p.status
        }));
      });
      await Promise.all(templateFetches);
    }

    const assignmentPrograms = assignments
      .filter((assignment) => !purchaseProgramIds.has(assignment.training_program_id))
      .map((assignment) => {
        const instance = instanceByAssignmentId[assignment.id] || null;
        const programMeta = assignment.training_program || null;

        // Coach lock: from instance if available, else from assignment itself
        const assignmentEndDate = assignment.computed_end_date || null;
        const isCoachLocked = !!(
          (instance && instance.coach_locked_until && instance.coach_locked_until >= today) ||
          (assignment.coach_id && assignmentEndDate && assignmentEndDate >= today)
        );

        const phase = deriveAssignmentPhase({ assignment, instance, isCoachLocked });

        // Athlete can self-start only when not coach-locked, assignment is running, and no active instance
        const canCreateInstance =
          !isCoachLocked &&
          (assignment.status === "active" || assignment.status === "scheduled") &&
          (!instance || instance.status === "cancelled" || instance.status === "completed");

        // Available templates for plan picker (only when athlete can/should pick)
        const templates = templatesByProgramId[assignment.training_program_id] || [];

        return {
          purchase: {
            id: assignment.id,
            programId: assignment.training_program_id,
            billingType: "assignment",
            status: assignment.status === "paused" ? "paused" : "paid",
            paidAt: assignment.created_at || null,
            expiresAt: assignment.computed_end_date || null,
            gracePeriodEndsAt: null
          },
          program: programMeta
            ? {
                id: programMeta.id,
                name: programMeta.name,
                accessModel: programMeta.access_model,
                classification: programMeta.classification || null,
                durationWeeks: assignment.duration_weeks || programMeta.duration_weeks,
                billingType: programMeta.billing_type,
                presetSelection: programMeta.preset_selection || 'coach'
              }
            : null,
          instance: instance
            ? {
                id: instance.id,
                status: instance.status,
                startDate: instance.start_date || null,
                coachLockedUntil: instance.coach_locked_until || null,
                accessModel: instance.access_model || null,
                planName: instance.plan ? instance.plan.name : null
              }
            : null,
          assignment: {
            id: assignment.id,
            selectedPresetId: assignment.selected_preset_id || null,
            selectedVariantId: assignment.selected_variant_id || null
          },
          phase,
          isCoachLocked,
          isInGrace: false,
          canCreateInstance,
          sourceType: "assignment",
          availableTemplates: templates
        };
      });

    const programs = [...purchasePrograms, ...assignmentPrograms];

    return json(200, { programs, orphanedInstances });
  } catch (err) {
    console.error("[athlete-my-programs] Unexpected error:", err);
    return json(500, { error: "Internal server error" });
  }
};
