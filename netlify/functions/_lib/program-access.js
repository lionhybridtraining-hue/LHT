const {
  getTrainingProgramById,
  getTrainingProgramByExternalId,
  getActiveStripePurchaseForIdentity,
  getActiveLikeProgramAssignment,
  getPaymentPlanById,
  getPaymentPlanByStripePurchaseId,
  getLatestPaymentPlanForIdentityProgram,
  getPaymentPlanCharges
} = require("./supabase");

function normalizeValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function resolveProgram(config, { programId, programExternalId } = {}) {
  const normalizedProgramId = normalizeValue(programId) || normalizeValue(config.defaultOnboardingProgramId);
  const normalizedExternalId = normalizeValue(programExternalId) || normalizeValue(config.defaultOnboardingProgramExternalId);

  if (normalizedProgramId) {
    const program = await getTrainingProgramById(config, normalizedProgramId);
    if (program) return program;
  }

  if (normalizedExternalId) {
    return getTrainingProgramByExternalId(config, normalizedExternalId);
  }

  return null;
}

async function getProgramAccess(config, { identityId, programId, programExternalId, atIso } = {}) {
  const program = await resolveProgram(config, { programId, programExternalId });
  if (!program) {
    return {
      hasAccess: false,
      reason: "program_not_found",
      program: null,
      purchase: null
    };
  }

  const purchase = await getActiveStripePurchaseForIdentity(config, {
    identityId,
    programId: program.id,
    atIso
  });

  return {
    hasAccess: !!purchase,
    reason: purchase ? "paid" : "payment_required",
    program,
    purchase
  };
}

async function getProgramAssociationAccess(
  config,
  { athleteId, identityId, programId, programExternalId, atIso } = {}
) {
  const program = await resolveProgram(config, { programId, programExternalId });
  if (!program) {
    return {
      hasAccess: false,
      reason: "program_not_found",
      via: null,
      program: null,
      purchase: null,
      assignment: null
    };
  }

  const [purchase, assignment] = await Promise.all([
    identityId
      ? getActiveStripePurchaseForIdentity(config, {
          identityId,
          programId: program.id,
          atIso
        })
      : Promise.resolve(null),
    athleteId
      ? getActiveLikeProgramAssignment(config, athleteId, program.id)
      : Promise.resolve(null)
  ]);

  const paymentModel = typeof program.payment_model === "string"
    ? program.payment_model.trim().toLowerCase()
    : "single";

  if (paymentModel === "phased" && identityId) {
    let phasedPlan = null;
    if (purchase && purchase.payment_plan_id) {
      phasedPlan = await getPaymentPlanById(config, purchase.payment_plan_id);
    }
    if (!phasedPlan && purchase && purchase.id) {
      phasedPlan = await getPaymentPlanByStripePurchaseId(config, purchase.id);
    }
    if (!phasedPlan) {
      phasedPlan = await getLatestPaymentPlanForIdentityProgram(config, {
        identityId,
        programId: program.id
      });
    }

    if (phasedPlan) {
      const charges = await getPaymentPlanCharges(config, phasedPlan.id);
      const now = new Date();
      const blocked = Array.isArray(charges) && charges.some((charge) => {
        if (!charge || charge.status !== "overdue") return false;
        if (!charge.grace_period_ends_at) return true;
        return new Date(charge.grace_period_ends_at) < now;
      });

      if (blocked) {
        return {
          hasAccess: false,
          reason: "phased_payment_overdue",
          via: null,
          program,
          purchase,
          assignment,
          paymentPlan: phasedPlan
        };
      }
    }
  }

  if (purchase) {
    return {
      hasAccess: true,
      reason: "purchase",
      via: "purchase",
      program,
      purchase,
      assignment
    };
  }

  if (assignment) {
    return {
      hasAccess: true,
      reason: "manual_assignment",
      via: "assignment",
      program,
      purchase: null,
      assignment
    };
  }

  return {
    hasAccess: false,
    reason: "program_association_required",
    via: null,
    program,
    purchase: null,
    assignment: null
  };
}

module.exports = {
  resolveProgram,
  getProgramAccess,
  getProgramAssociationAccess
};