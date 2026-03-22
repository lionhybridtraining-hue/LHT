const {
  getTrainingProgramById,
  getTrainingProgramByExternalId,
  getActiveStripePurchaseForIdentity
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

module.exports = {
  resolveProgram,
  getProgramAccess
};