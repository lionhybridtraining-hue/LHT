/**
 * Plan Adherence Engine
 *
 * After a Strava activity is ingested, this module:
 * 1. Computes TSS via the backend engine (tss.js)
 * 2. Patches the training_session with computed tss + intensity_factor
 * 3. Attempts to match the session against a planned running slot (conservative)
 * 4. Marks the matching slot as completed with adherence metadata
 */

const { computeSessionTSS } = require("./tss");
const { classifyModality } = require("./strava");
const {
  getAthleteById,
  listAthleteTrainingZoneProfiles,
  findPlannedRunningSlotsForDate,
  markRunningPlanSlotCompleted
} = require("./supabase");

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function isPositive(v) {
  return Number.isFinite(v) && v > 0;
}

function roundTo(v, d) {
  if (!Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/**
 * Build athlete thresholds from the athletes row.
 * Currently uses lthr and vdot. FTP and swim threshold must be added
 * to the athletes table or zones jsonb when available.
 */
function buildThresholds(athlete, modality, zoneProfiles = []) {
  if (!athlete) return {};
  const thresholds = {};

  // LTHR — already in athletes table
  if (isPositive(Number(athlete.lthr))) {
    thresholds.lthr = Number(athlete.lthr);
  }

  // FTP — check zones jsonb for ftp_watts
  const zones = athlete.zones || {};
  if (isPositive(Number(zones.ftp_watts))) {
    thresholds.ftpWatts = Number(zones.ftp_watts);
  }

  // Threshold pace (sec/km) — from zones or derived from VDOT
  if (isPositive(Number(zones.threshold_pace_sec_per_km))) {
    thresholds.thresholdPaceSecPerKm = Number(zones.threshold_pace_sec_per_km);
  } else if (isPositive(Number(athlete.vdot))) {
    // Approximate threshold pace from VDOT using Daniels' tables approximation
    // T-pace ≈ 5.0 * (VDOT)^(-0.42) * 60 (rough approximation in sec/km)
    // For VDOT 40 → ~303 s/km (5:03), VDOT 50 → ~258 s/km (4:18), VDOT 60 → ~228 s/km (3:48)
    const vdot = Number(athlete.vdot);
    const thresholdPace = 5.0 * Math.pow(vdot, -0.42) * 60;
    if (isPositive(thresholdPace)) {
      thresholds.thresholdPaceSecPerKm = roundTo(thresholdPace, 1);
    }
  }

  // Swim threshold speed (m/min)
  if (isPositive(Number(zones.swim_threshold_speed_m_per_min))) {
    thresholds.swimThresholdSpeedMperMin = Number(zones.swim_threshold_speed_m_per_min);
  }

  const profiles = Array.isArray(zoneProfiles) ? zoneProfiles : [];
  const modalityKey = String(modality || "other").toLowerCase();
  const metricProfiles = profiles.filter((p) => String(p.metric_type || "").toLowerCase() === "heart_rate");
  const profile = metricProfiles.find((p) => String(p.modality || "").toLowerCase() === modalityKey)
    || metricProfiles.find((p) => String(p.modality || "").toLowerCase() === "general")
    || null;

  if (profile) {
    if (isPositive(Number(profile.lthr_bpm))) {
      thresholds.lthr = Number(profile.lthr_bpm);
    }
    if (isPositive(Number(profile.hr_max_bpm))) {
      thresholds.hrMax = Number(profile.hr_max_bpm);
    }
    if (isPositive(Number(profile.hr_rest_bpm))) {
      thresholds.hrRest = Number(profile.hr_rest_bpm);
    }
    if (typeof profile.model === "string" && profile.model.trim()) {
      thresholds.hrMethod = profile.model.trim().toLowerCase();
    }
  }

  return thresholds;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main: enrichSession — compute TSS and optionally match plan
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Enrich a set of sessions with TSS and plan-adherence.
 *
 * @param {Object} config — app config (supabase credentials etc)
 * @param {string} athleteId
 * @param {Object[]} sessions — array of mapped training_sessions rows (already upserted)
 * @returns {{ tssPatches: Object[], adherenceResults: Object[] }}
 *   tssPatches: [{ source_session_id, tss, intensity_factor, tss_method }]
 *   adherenceResults: [{ slotId, sessionDate, matched }]
 */
async function enrichSessionsAfterSync(config, athleteId, sessions) {
  if (!sessions || !sessions.length) {
    return { tssPatches: [], adherenceResults: [] };
  }

  // Load athlete for thresholds
  const athlete = await getAthleteById(config, athleteId);
  const zoneProfiles = await listAthleteTrainingZoneProfiles(config, athleteId);

  const tssPatches = [];
  const adherenceResults = [];

  for (const session of sessions) {
    // 1. Compute TSS
    const modality = classifyModality(session.sport_type);
    const thresholds = buildThresholds(athlete, modality, zoneProfiles);
    const tssResult = computeSessionTSS(session, thresholds);
    tssPatches.push({
      source_session_id: session.source_session_id,
      tss: tssResult.tss,
      intensity_factor: tssResult.intensityFactor,
      tss_method: tssResult.method
    });

    // 2. Plan adherence (running only, conservative)
    if (modality === "run" && session.session_date) {
      try {
        const slots = await findPlannedRunningSlotsForDate(config, athleteId, session.session_date);
        // Conservative rule: only auto-complete if exactly 1 planned slot for this day
        if (Array.isArray(slots) && slots.length === 1) {
          const slot = slots[0];
          const durationEstimate = Number(slot.duration_estimate_min) || 0;
          const actualDuration = Number(session.actual_duration_minutes) || Number(session.duration_minutes) || 0;

          // Compute adherence ratio
          let adherenceRatio = null;
          if (isPositive(durationEstimate) && isPositive(actualDuration)) {
            adherenceRatio = roundTo(actualDuration / durationEstimate, 3);
          }

          const matchData = {
            strava_activity_id: session.source_session_id,
            matched_at: new Date().toISOString(),
            actual_duration_min: actualDuration || null,
            actual_distance_km: Number(session.distance_km) || null,
            tss: tssResult.tss,
            tss_method: tssResult.method,
            avg_hr: Number(session.avg_heart_rate) || null,
            avg_pace: session.avg_pace || null,
            sport_type: session.sport_type || null,
            adherence_ratio: adherenceRatio,
            confidence: "auto"
          };

          await markRunningPlanSlotCompleted(config, slot.id, matchData);
          adherenceResults.push({ slotId: slot.id, sessionDate: session.session_date, matched: true, adherenceRatio });
        } else {
          adherenceResults.push({ slotId: null, sessionDate: session.session_date, matched: false, candidates: (slots || []).length });
        }
      } catch (err) {
        console.error(`plan-adherence: error matching session ${session.source_session_id} on ${session.session_date}:`, err.message);
        adherenceResults.push({ slotId: null, sessionDate: session.session_date, matched: false, error: err.message });
      }
    }
  }

  return { tssPatches, adherenceResults };
}

module.exports = {
  enrichSessionsAfterSync,
  buildThresholds,
  computeSessionTSS
};
