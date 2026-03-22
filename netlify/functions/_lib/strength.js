// Strength Training Engine — %RM lookup, load resolution, volume metrics

// ── %RM × Reps lookup table ──
// effectiveReps (reps + RIR) → decimal %RM
const RM_TABLE = {
  1: 1.00, 2: 0.97, 3: 0.94, 4: 0.92, 5: 0.89,
  6: 0.86, 7: 0.83, 8: 0.81, 9: 0.78, 10: 0.75,
  11: 0.73, 12: 0.71, 13: 0.70, 14: 0.68, 15: 0.67,
  16: 0.65, 17: 0.64, 18: 0.63, 19: 0.61, 20: 0.60,
  21: 0.59, 22: 0.58, 23: 0.57, 24: 0.56, 25: 0.55,
  26: 0.54, 27: 0.53, 28: 0.52, 29: 0.51, 30: 0.50,
  31: 0.49, 32: 0.48, 33: 0.47, 34: 0.46, 35: 0.45
};

// ── Plyo timing constants ──
const GCT_CONTACT = { "rápido": 0.2, "intermédio": 0.5, "altura": 1.0 };
const MLOAD_RECOVERY = { low: 1.5, medium: 2.5, high: 4.0 };
const MLOAD_WEIGHT   = { high: 1, medium: 2/3, low: 1/3 };

/**
 * Parse tempo string "Ecc-Pause-Con-Pause" e.g. "3-1-X-0"
 * X/x = as fast as possible, counts as 1s for calculations
 * Returns null if invalid/empty
 */
function parseTempo(tempoStr) {
  if (!tempoStr || typeof tempoStr !== "string") return null;
  const parts = tempoStr.split("-");
  if (parts.length !== 4) return null;

  const parsed = parts.map(p => {
    const trimmed = p.trim().toUpperCase();
    if (trimmed === "X") return 1;
    const n = parseInt(trimmed, 10);
    return isNaN(n) || n < 0 ? null : n;
  });

  if (parsed.some(v => v === null)) return null;

  return {
    ecc: parsed[0],
    pauseBot: parsed[1],
    con: parsed[2],
    pauseTop: parsed[3],
    totalSeconds: parsed[0] + parsed[1] + parsed[2] + parsed[3]
  };
}

/**
 * %RM lookup from reps and RIR
 * effectiveReps = reps + rir → table lookup
 * Returns decimal (e.g. 0.75) or null if out of range
 */
function calculateRmPercent(reps, rir) {
  if (reps == null || reps < 1) return null;
  const effective = reps + (rir != null ? rir : 0);
  return RM_TABLE[effective] || null;
}

/**
 * 1RM estimation via Epley formula
 * reps==1 → weight; else weight × (1 + reps/30)
 */
function estimate1rm(weight, reps) {
  if (!weight || weight <= 0 || !reps || reps < 1) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/**
 * Round load down to nearest plate increment
 */
function roundToPlates(kg, loadRound) {
  if (!loadRound || loadRound <= 0) return kg;
  return Math.floor(kg / loadRound) * loadRound;
}

/**
 * Resolve load for a prescription (3 modes)
 * 1. load_override_kg → use directly
 * 2. rm_percent_override → %RM = override + weekly increase → calc load
 * 3. Auto → %RM from reps+RIR lookup + weekly increase → calc load
 *
 * Returns { rmPercent, loadKg } or { rmPercent: null, loadKg: null }
 */
function resolveLoad(prescription, planExercise, oneRm, loadRound, weekNumber) {
  const week = weekNumber || 1;
  const increase = planExercise.rm_percent_increase_per_week || 0;
  const round = loadRound || 2.5;

  // Mode 1: forced load
  if (prescription.load_override_kg != null) {
    return { rmPercent: null, loadKg: prescription.load_override_kg };
  }

  // Mode 2: forced %RM
  if (prescription.rm_percent_override != null) {
    const baseRm = prescription.rm_percent_override;
    const rmPercent = baseRm + (week - 1) * increase;
    if (!oneRm) return { rmPercent, loadKg: null };
    return { rmPercent, loadKg: roundToPlates(oneRm * rmPercent, round) };
  }

  // Mode 3: auto from reps+RIR
  const reps = prescription.reps;
  const rir = prescription.rir;
  const baseRm = calculateRmPercent(reps, rir);
  if (baseRm == null) return { rmPercent: null, loadKg: null };

  const rmPercent = baseRm + (week - 1) * increase;
  if (!oneRm) return { rmPercent, loadKg: null };
  return { rmPercent, loadKg: roundToPlates(oneRm * rmPercent, round) };
}

/**
 * Estimate reps from duration + tempo (for strength exercises)
 */
function estimateRepsFromDuration(durationSec, tempoStr) {
  if (!durationSec || durationSec <= 0) return null;
  const tempo = parseTempo(tempoStr);
  if (!tempo || tempo.totalSeconds <= 0) return null;
  return Math.floor(durationSec / tempo.totalSeconds);
}

/**
 * Stimulating reps = last 5 reps before failure
 * Formula: max(0, reps - max(0, reps + rir - 5))
 */
function calculateStimulatingReps(reps, rir) {
  if (reps == null || reps < 1) return 0;
  const r = rir != null ? rir : 0;
  return Math.max(0, reps - Math.max(0, reps + r - 5));
}

/**
 * Time Under Tension = reps × tempo totalSeconds
 */
function calculateTUT(reps, tempoStr) {
  if (!reps || reps < 1) return 0;
  const tempo = parseTempo(tempoStr);
  if (!tempo) return 0;
  return reps * tempo.totalSeconds;
}

/**
 * Plyo load = sets × reps × (eachSide?2:1) × mechLoadWeight
 */
function calculatePlyoLoad(sets, reps, eachSide, mechLoad) {
  if (!sets || !reps) return 0;
  const sides = eachSide ? 2 : 1;
  const weight = MLOAD_WEIGHT[mechLoad] || 1;
  return sets * reps * sides * weight;
}

/**
 * Estimate plyo reps from duration + GCT descriptor + mechanical load
 * cycleTime = contactTime × recoveryFactor
 * reps = floor(duration / cycleTime)
 */
function estimatePlyoReps(durationSec, gct, mechLoad) {
  if (!durationSec || durationSec <= 0) return null;
  const contact = GCT_CONTACT[gct];
  const recovery = MLOAD_RECOVERY[mechLoad];
  if (contact == null || recovery == null) return null;
  const cycleTime = contact * recovery;
  if (cycleTime <= 0) return null;
  return Math.floor(durationSec / cycleTime);
}

/**
 * Resolve effective reps depending on prescription type and section
 */
function resolveReps(prescription, section, planExercise) {
  if (prescription.prescription_type === "reps" || !prescription.prescription_type) {
    return prescription.reps || 0;
  }
  // duration mode
  if (section === "plyos_speed") {
    return estimatePlyoReps(
      prescription.duration_seconds,
      prescription.gct,
      planExercise && planExercise.plyo_mechanical_load
    ) || 0;
  }
  // strength/other: estimate from tempo
  return estimateRepsFromDuration(
    prescription.duration_seconds,
    prescription.tempo
  ) || 0;
}

/**
 * Calculate volume metrics for a set of prescriptions + plan exercises in a week
 * Each item: { prescription, planExercise, oneRm, loadRound }
 */
function calculateVolumeMetrics(items, weekNumber) {
  let totalReps = 0;
  let stimulatingReps = 0;
  let totalRepsTimesRm = 0;
  let totalKg = 0;
  let totalTUT = 0;
  let plyoLoad = 0;

  for (const item of items) {
    const { prescription: rx, planExercise: pe } = item;
    const section = pe.section;
    const sets = rx.sets || 1;
    const reps = resolveReps(rx, section, pe);
    const sides = pe.each_side ? 2 : 1;

    if (section === "plyos_speed") {
      plyoLoad += calculatePlyoLoad(sets, reps, pe.each_side, pe.plyo_mechanical_load);
    } else {
      const setReps = reps * sides;
      totalReps += sets * setReps;
      stimulatingReps += sets * calculateStimulatingReps(reps, rx.rir) * sides;

      const { rmPercent, loadKg } = resolveLoad(rx, pe, item.oneRm, item.loadRound, weekNumber);
      if (rmPercent != null) {
        totalRepsTimesRm += sets * setReps * rmPercent;
      }
      if (loadKg != null) {
        totalKg += sets * setReps * loadKg;
      }

      totalTUT += sets * calculateTUT(reps, rx.tempo) * sides;
    }
  }

  return { totalReps, stimulatingReps, totalRepsTimesRm, totalKg, totalTUT, plyoLoad };
}

module.exports = {
  RM_TABLE,
  parseTempo,
  calculateRmPercent,
  estimate1rm,
  roundToPlates,
  resolveLoad,
  estimateRepsFromDuration,
  calculateStimulatingReps,
  calculateTUT,
  calculatePlyoLoad,
  estimatePlyoReps,
  resolveReps,
  calculateVolumeMetrics
};
