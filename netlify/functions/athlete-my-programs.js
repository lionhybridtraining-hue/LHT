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
  getAllInstancesForAthlete
} = require("./_lib/supabase");

function derivePhase({ purchase, instance, isCoachLocked, isInGrace }) {
  if (purchase.status === "cancelled") return "cancelled";
  if (purchase.status === "payment_failed" && !isInGrace) return "expired";
  if (purchase.status === "payment_failed" && isInGrace) return "grace";
  if (isCoachLocked) return "coached";

  const accessModel = (instance && instance.access_model) ||
    (purchase.training_programs && purchase.training_programs.access_model) || null;

  if (accessModel === "coached_one_time") return "self_serve"; // coaching period ended
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

    const [purchases, allInstances] = await Promise.all([
      getStripePurchasesForIdentity(config, identityId),
      getAllInstancesForAthlete(config, athlete.id)
    ]);

    // Index instances by stripe_purchase_id for O(1) lookup
    const instanceByPurchaseId = {};
    const orphanedInstances = [];

    for (const inst of allInstances) {
      if (inst.stripe_purchase_id) {
        // Keep only the most recent instance per purchase (list is ordered by created_at desc)
        if (!instanceByPurchaseId[inst.stripe_purchase_id]) {
          instanceByPurchaseId[inst.stripe_purchase_id] = inst;
        }
      } else {
        orphanedInstances.push(inst);
      }
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const programs = purchases.map((purchase) => {
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

      const phase = derivePhase({ purchase, instance, isCoachLocked, isInGrace });

      const canCreateInstance =
        purchase.status === "paid" || isInGrace
          ? (!instance || instance.status === "cancelled" || instance.status === "completed")
          : false;

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
              durationWeeks: programMeta.duration_weeks,
              billingType: programMeta.billing_type
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
        canCreateInstance
      };
    });

    return json(200, { programs, orphanedInstances });
  } catch (err) {
    console.error("[athlete-my-programs] Unexpected error:", err);
    return json(500, { error: "Internal server error" });
  }
};
