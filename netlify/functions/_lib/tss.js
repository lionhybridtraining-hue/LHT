/**
 * TSS Calculation Engine
 *
 * All TSS values are calculated in the LHT backend.
 * No external TSS (e.g. Strava suffer_score) is used as the final value.
 *
 * Method hierarchy per session:
 *   1. power   — Bike/Row with valid power data + FTP
 *   2. run_pace — Run with valid pace data + threshold pace
 *   3. swim_speed — Swim with valid distance/time + threshold speed
 *   4. heart_rate — Any modality with valid HR data + LTHR
 *   5. none    — Insufficient data, tss = null
 *
 * Reference: TrainingPeaks methodology
 */

const { classifyModality } = require("./strava");

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function isPositive(value) {
  return Number.isFinite(value) && value > 0;
}

function roundTo(value, digits) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// ──────────────────────────────────────────────────────────────────────────────
// A) Power-based TSS (Bike / Row)
//    TSS = hours × IF² × 100
//    IF  = NP / FTP
//
//    Without a time-series we cannot compute NP, so we fall back to
//    avg_power as an approximation of NP.
// ──────────────────────────────────────────────────────────────────────────────

function calculatePowerTSS({ avgPowerWatts, durationSeconds, ftpWatts }) {
  if (!isPositive(avgPowerWatts) || !isPositive(durationSeconds) || !isPositive(ftpWatts)) {
    return null;
  }
  const intensityFactor = avgPowerWatts / ftpWatts;
  const hours = durationSeconds / 3600;
  const tss = hours * intensityFactor * intensityFactor * 100;
  return { tss: roundTo(tss, 2), intensityFactor: roundTo(intensityFactor, 3), method: "power" };
}

// ──────────────────────────────────────────────────────────────────────────────
// B) Running rTSS
//    rTSS = hours × IF² × 100
//    IF   = averageSpeed / thresholdSpeed
//
//    We use average speed (m/s) because pace (min/km) inverts the ratio.
//    Without elevation data for NGP, average speed is the best proxy.
// ──────────────────────────────────────────────────────────────────────────────

function calculateRunTSS({ distanceMeters, durationSeconds, thresholdPaceSecPerKm }) {
  if (!isPositive(distanceMeters) || !isPositive(durationSeconds) || !isPositive(thresholdPaceSecPerKm)) {
    return null;
  }
  const avgSpeedMps = distanceMeters / durationSeconds;
  const thresholdSpeedMps = 1000 / thresholdPaceSecPerKm;
  if (!isPositive(thresholdSpeedMps)) return null;

  const intensityFactor = avgSpeedMps / thresholdSpeedMps;
  const hours = durationSeconds / 3600;
  const tss = hours * intensityFactor * intensityFactor * 100;
  return { tss: roundTo(tss, 2), intensityFactor: roundTo(intensityFactor, 3), method: "run_pace" };
}

// ──────────────────────────────────────────────────────────────────────────────
// C) Swim sTSS
//    sTSS = hours_moving × IF³ × 100   (cubed per TP methodology)
//    IF   = NSS / swimThresholdSpeed    (both in m/min)
// ──────────────────────────────────────────────────────────────────────────────

function calculateSwimTSS({ distanceMeters, movingSeconds, swimThresholdSpeedMperMin }) {
  if (!isPositive(distanceMeters) || !isPositive(movingSeconds) || !isPositive(swimThresholdSpeedMperMin)) {
    return null;
  }
  const nss = distanceMeters / (movingSeconds / 60); // m/min
  const intensityFactor = nss / swimThresholdSpeedMperMin;
  const hours = movingSeconds / 3600;
  const tss = hours * intensityFactor * intensityFactor * intensityFactor * 100;
  return { tss: roundTo(tss, 2), intensityFactor: roundTo(intensityFactor, 3), method: "swim_speed" };
}

// ──────────────────────────────────────────────────────────────────────────────
// D) Heart-rate based hrTSS
//    Simplified model: hrTSS ≈ hours × (avg_hr / lthr)² × 100
//
//    This is a pragmatic approximation of the zone-weighted method when
//    we only have average HR (no second-by-second series).
//    For steady-state efforts this tracks well; for highly variable efforts
//    it underestimates.
// ──────────────────────────────────────────────────────────────────────────────

function calculateHeartRateTSS({ avgHeartRate, durationSeconds, lthr, hrMax, hrRest, hrMethod }) {
  if (!isPositive(avgHeartRate) || !isPositive(durationSeconds)) {
    return null;
  }

  const method = String(hrMethod || "lthr").toLowerCase();
  let intensityFactor = null;
  let methodTag = "heart_rate_lthr";

  if (method === "percent_hrmax") {
    if (!isPositive(hrMax)) return null;
    intensityFactor = avgHeartRate / hrMax;
    methodTag = "heart_rate_percent_hrmax";
  } else if (method === "hrr") {
    if (!isPositive(hrMax) || !isPositive(hrRest) || hrMax <= hrRest) return null;
    intensityFactor = (avgHeartRate - hrRest) / (hrMax - hrRest);
    methodTag = "heart_rate_hrr";
  } else {
    if (!isPositive(lthr)) return null;
    intensityFactor = avgHeartRate / lthr;
  }

  if (!Number.isFinite(intensityFactor) || intensityFactor <= 0) return null;
  const hours = durationSeconds / 3600;
  const tss = hours * intensityFactor * intensityFactor * 100;
  return { tss: roundTo(tss, 2), intensityFactor: roundTo(intensityFactor, 3), method: methodTag };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main function: select the best method and compute TSS for a session
// ──────────────────────────────────────────────────────────────────────────────

/**
 * computeSessionTSS(session, athleteThresholds)
 *
 * @param {Object} session — a mapped training_sessions row (from Strava or CSV)
 * @param {Object} athleteThresholds — individual reference values:
 *   { ftpWatts, thresholdPaceSecPerKm, swimThresholdSpeedMperMin, lthr }
 *   All fields are optional; missing ones simply disable that method.
 *
 * @returns {{ tss: number|null, intensityFactor: number|null, method: string }}
 */
function computeSessionTSS(session, athleteThresholds = {}) {
  const sportType = session.sport_type || "";
  const modality = classifyModality(sportType);

  const durationSeconds = isPositive(session.actual_duration_minutes)
    ? session.actual_duration_minutes * 60
    : isPositive(session.duration_minutes)
      ? session.duration_minutes * 60
      : 0;

  const distanceMeters = Number(session.actual_distance_meters) || 0;
  const avgPowerWatts = Number(session.avg_power) || 0;
  const avgHeartRate = Number(session.avg_heart_rate) || 0;

  // 1. Power (bike / row)
  if ((modality === "bike" || modality === "row") && isPositive(avgPowerWatts) && isPositive(athleteThresholds.ftpWatts)) {
    const result = calculatePowerTSS({ avgPowerWatts, durationSeconds, ftpWatts: athleteThresholds.ftpWatts });
    if (result) return result;
  }

  // 2. Run pace
  if (modality === "run" && isPositive(distanceMeters) && isPositive(durationSeconds) && isPositive(athleteThresholds.thresholdPaceSecPerKm)) {
    const result = calculateRunTSS({ distanceMeters, durationSeconds, thresholdPaceSecPerKm: athleteThresholds.thresholdPaceSecPerKm });
    if (result) return result;
  }

  // 3. Swim speed
  if (modality === "swim" && isPositive(distanceMeters) && isPositive(durationSeconds) && isPositive(athleteThresholds.swimThresholdSpeedMperMin)) {
    const result = calculateSwimTSS({ distanceMeters, movingSeconds: durationSeconds, swimThresholdSpeedMperMin: athleteThresholds.swimThresholdSpeedMperMin });
    if (result) return result;
  }

  // 4. Heart rate fallback (any modality)
  if (isPositive(avgHeartRate) && isPositive(durationSeconds)) {
    const result = calculateHeartRateTSS({
      avgHeartRate,
      durationSeconds,
      lthr: athleteThresholds.lthr,
      hrMax: athleteThresholds.hrMax,
      hrRest: athleteThresholds.hrRest,
      hrMethod: athleteThresholds.hrMethod
    });
    if (result) return result;
  }

  // 5. No method available
  return { tss: null, intensityFactor: null, method: "none" };
}

module.exports = {
  computeSessionTSS,
  calculatePowerTSS,
  calculateRunTSS,
  calculateSwimTSS,
  calculateHeartRateTSS,
  classifyModality
};
