/**
 * Running Engine v1
 * JavaScript port of Python aer-backend VDOT calculator and training plan generator
 * Mirrors AWS Lambda athlete_funcs.py + training_funcs.py
 *
 * Based on: Daniels & Gilbert "Oxygen Power: Performance Tables for Distance Running"
 * Zone system: 7 zones derived from 6 Daniels paces + 1 sprint zone
 */

const ENGINE_VERSION = 'running-v1';

/**
 * Calculate VDOT from race result
 * Daniels & Gilbert "Oxygen Power" formula:
 *   VO2 = -4.60 + 0.182258 × velocity + 0.000104 × velocity²
 *   %VO2max = 0.8 + 0.1894393 × e^(-0.012778 × t) + 0.2989558 × e^(-0.1932605 × t)
 *   VDOT = VO2 / %VO2max
 *
 * @param {number} raceDistanceKm - Race distance in kilometers
 * @param {number} raceTimeSec - Race duration in seconds
 * @returns {number} VO2max estimate (mL/kg/min)
 */
function calculateVDOT(raceDistanceKm, raceTimeSec) {
  if (raceDistanceKm <= 0 || raceTimeSec <= 0) {
    throw new Error('Race distance and time must be positive');
  }

  const raceTimeMin = raceTimeSec / 60;
  const distanceMeters = raceDistanceKm * 1000;
  const velocity = distanceMeters / raceTimeMin; // meters per minute

  // VO2 cost of running at this velocity
  const vo2 = -4.60 + 0.182258 * velocity + 0.000104 * velocity ** 2;

  // Fractional VO2max utilization (time-based exponential decay)
  const pctVo2max =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * raceTimeMin) +
    0.2989558 * Math.exp(-0.1932605 * raceTimeMin);

  const vdot = vo2 / pctVo2max;

  // Clamp to realistic range
  return Math.max(20, Math.min(85, parseFloat(vdot.toFixed(1))));
}

/**
 * Calculate 6 key paces from VDOT (Daniels tables)
 * Returns paces in seconds per kilometer
 *
 * Paces returned:
 * - Easy Slow (Easy-, recovery)
 * - Easy Fast (Easy+)
 * - Marathon Pace (M, endurance zone, moderate aerobic)
 * - Threshold Pace (T, lactate threshold)
 * - Interval Pace (I, VO2max)
 * - Repetition Pace (RR, max sustainable velocity)
 *
 * @param {number} vdot - VO2max estimate
 * @returns {Object} { easySlowSecPerKm, easyFastSecPerKm, marathonSecPerKm, thresholdSecPerKm, intervalSecPerKm, rrSecPerKm }
 */
function calculatePaces(vdot) {
  if (vdot < 20 || vdot > 85) {
    throw new Error('VDOT must be between 20 and 85');
  }

  // Quadratic approximations fitted to Daniels tables (sec/km)
  // Form: pace = a + b*vdot + c*vdot²
  // Fitted from reference points at VDOT 30, 40, 50, 60, 70

  const easySlowSecPerKm   = 814.0  - 13.95 * vdot + 0.0850 * vdot ** 2;
  const easyFastSecPerKm   = 790.0  - 13.70 * vdot + 0.0830 * vdot ** 2;
  const marathonSecPerKm   = 682.0  - 11.10 * vdot + 0.0650 * vdot ** 2;
  const thresholdSecPerKm  = 628.0  - 10.05 * vdot + 0.0575 * vdot ** 2;
  const intervalSecPerKm   = 574.0  -  9.35 * vdot + 0.0540 * vdot ** 2;
  const rrSecPerKm         = 516.0  -  8.35 * vdot + 0.0475 * vdot ** 2;

  const times = {
    easySlowSecPerKm:  parseFloat(Math.max(200, easySlowSecPerKm).toFixed(1)),
    easyFastSecPerKm:  parseFloat(Math.max(190, easyFastSecPerKm).toFixed(1)),
    marathonSecPerKm:  parseFloat(Math.max(170, marathonSecPerKm).toFixed(1)),
    thresholdSecPerKm: parseFloat(Math.max(160, thresholdSecPerKm).toFixed(1)),
    intervalSecPerKm:  parseFloat(Math.max(150, intervalSecPerKm).toFixed(1)),
    rrSecPerKm:        parseFloat(Math.max(140, rrSecPerKm).toFixed(1)),
  };

  // Ensure monotonic order: easySlow > easyFast > marathon > threshold > interval > rr
  if (times.easyFastSecPerKm >= times.easySlowSecPerKm) {
    times.easyFastSecPerKm = times.easySlowSecPerKm - 5;
  }
  if (times.marathonSecPerKm >= times.easyFastSecPerKm) {
    times.marathonSecPerKm = times.easyFastSecPerKm - 5;
  }
  if (times.thresholdSecPerKm >= times.marathonSecPerKm) {
    times.thresholdSecPerKm = times.marathonSecPerKm - 5;
  }
  if (times.intervalSecPerKm >= times.thresholdSecPerKm) {
    times.intervalSecPerKm = times.thresholdSecPerKm - 5;
  }
  if (times.rrSecPerKm >= times.intervalSecPerKm) {
    times.rrSecPerKm = times.intervalSecPerKm - 5;
  }

  return times;
}

/**
 * Compute 7-zone distribution from VDOT
 * Z1-Z7 derived from 6 Daniels paces + 1 sprint overlay
 *
 * Zones:
 * Z1: Sprint (RR × 0.9) — max velocity bursts, neuromuscular
 * Z2: Velocidade/Repetition (RR pace) — max sustainable velocity
 * Z3: VO2max/Interval (I pace) — aerobic capacity
 * Z4: Limiar/Threshold (T pace) — lactate threshold
 * Z5: Endurance/Marathon (M pace) — moderate aerobic steady-state
 * Z6: Fácil Rápida/Easy+ (E rápido) — active recovery, zone 2
 * Z7: Recuperação/Easy- (E lento) — very easy, base building
 *
 * @param {number} vdot - VO2max estimate
 * @returns {Object} { z1, z2, z3, z4, z5, z6, z7 } with { minSecPerKm, maxSecPerKm, label } each
 */
function computeZonesFromVdot(vdot) {
  const paces = calculatePaces(vdot);

  // Each zone defined by lower and upper pace bounds (inclusive)
  const zones = {
    z1: {
      label: 'Sprint',
      portugueseLabel: 'Sprint',
      minSecPerKm: Math.max(150, paces.rrSecPerKm * 0.85),
      maxSecPerKm: paces.rrSecPerKm * 0.95,
      color: '#FF0000',
      danielsPace: 'RR × 0.9',
      percentVo2max: 110,
      energySystem: 'ATP-PC + Anaerobic',
    },
    z2: {
      label: 'Velocidade/Repetition',
      portugueseLabel: 'Velocidade',
      minSecPerKm: paces.rrSecPerKm - 2,
      maxSecPerKm: paces.rrSecPerKm + 2,
      color: '#FF6600',
      danielsPace: 'RR',
      percentVo2max: 105,
      energySystem: 'Anaerobic Alactic Lactic',
    },
    z3: {
      label: 'VO2max/Interval',
      portugueseLabel: 'VO2max',
      minSecPerKm: paces.intervalSecPerKm - 2,
      maxSecPerKm: paces.intervalSecPerKm + 2,
      color: '#FFCC00',
      danielsPace: 'I',
      percentVo2max: 100,
      energySystem: 'Aerobic Alactic',
    },
    z4: {
      label: 'Limiar/Threshold',
      portugueseLabel: 'Limiar',
      minSecPerKm: paces.thresholdSecPerKm - 2,
      maxSecPerKm: paces.thresholdSecPerKm + 2,
      color: '#00CC00',
      danielsPace: 'T',
      percentVo2max: 88,
      energySystem: 'Lactate Threshold',
    },
    z5: {
      label: 'Endurance/Marathon',
      portugueseLabel: 'Resistência',
      minSecPerKm: paces.marathonSecPerKm - 3,
      maxSecPerKm: paces.marathonSecPerKm + 3,
      color: '#0099FF',
      danielsPace: 'M',
      percentVo2max: 86,
      energySystem: 'Aerobic',
    },
    z6: {
      label: 'Fácil Rápida/Easy+',
      portugueseLabel: 'Fácil Rápida',
      minSecPerKm: paces.easyFastSecPerKm - 5,
      maxSecPerKm: paces.easyFastSecPerKm + 5,
      color: '#00CCFF',
      danielsPace: 'E rápido',
      percentVo2max: 70,
      energySystem: 'Aerobic + Moderate',
    },
    z7: {
      label: 'Recuperação/Easy-',
      portugueseLabel: 'Recuperação',
      minSecPerKm: paces.easySlowSecPerKm,
      maxSecPerKm: 999,
      color: '#0066FF',
      danielsPace: 'E lento',
      percentVo2max: 60,
      energySystem: 'Aerobic Base',
    },
  };

  // Round all paces to 1 decimal
  Object.keys(zones).forEach((zoneKey) => {
    zones[zoneKey].minSecPerKm = parseFloat(zones[zoneKey].minSecPerKm.toFixed(1));
    zones[zoneKey].maxSecPerKm = parseFloat(zones[zoneKey].maxSecPerKm.toFixed(1));
  });

  return zones;
}

/**
 * Assign athlete level based on VDOT
 * Categories: Beginner, Intermediate, Advanced, Elite
 *
 * @param {number} vdot
 * @returns {string} level
 */
function assignAthleteLevel(vdot) {
  if (vdot < 35) return 'Beginner';
  if (vdot < 50) return 'Intermediate';
  if (vdot < 65) return 'Advanced';
  return 'Elite';
}

/**
 * Calculate initial weekly running volume (km) for an athlete
 * Based on VDOT, existing training history (if any), and phase
 *
 * @param {number} vdot
 * @param {number} maxWeeklyVolumeKm - Maximum weekly volume athlete has done
 * @param {string} phase - 'base' | 'build' | 'peak'
 * @returns {number} Initial weekly volume in km
 */
function calculateInitialVolume(
  vdot,
  maxWeeklyVolumeKm = 0,
  phase = 'base'
) {
  // Conservative starting point: 10-15 km/week for beginners
  const baseVolume = Math.max(10, Math.min(60, vdot * 0.6));

  // Adjust for previous history
  const historicalAdjustment = maxWeeklyVolumeKm > 0
    ? maxWeeklyVolumeKm * 0.7
    : baseVolume;

  // Phase multiplier
  const phaseMultiplier = {
    base: 1.0,
    build: 1.15,
    peak: 1.3,
  }[phase] || 1.0;

  return parseFloat((historicalAdjustment * phaseMultiplier).toFixed(1));
}

/**
 * Generate weekly distance targets for each week of a training phase
 * Uses periodization: build-up, peak, taper
 *
 * @param {number} totalWeeks - Total weeks in plan
 * @param {number} initialVolumeKm - Starting volume
 * @param {string} periodizationType - 'linear' | 'undulating' | 'block'
 * @returns {Array<number>} Weekly distances in km [week1, week2, ...]
 */
function phaseWeeklyDistances(
  totalWeeks,
  initialVolumeKm,
  periodizationType = 'undulating'
) {
  if (totalWeeks < 4 || totalWeeks > 52) {
    throw new Error('Total weeks must be between 4 and 52');
  }

  const weeks = [];
  const peakWeek = Math.floor(totalWeeks * 0.75);

  for (let i = 1; i <= totalWeeks; i++) {
    let multiplier;

    if (periodizationType === 'linear') {
      // Linear progression: steady increase then sudden taper
      if (i <= peakWeek) {
        multiplier = 0.8 + (0.2 * i) / peakWeek;
      } else {
        const tapweeks = totalWeeks - peakWeek;
        multiplier = 1.0 - 0.5 * ((i - peakWeek) / tapweeks);
      }
    } else if (periodizationType === 'undulating') {
      // Undulating: 2-week build, 1-week recovery pattern
      const cyclePos = i % 3;
      if (cyclePos === 0) {
        multiplier = 1.1; // Build week 2
      } else if (cyclePos === 1) {
        multiplier = 0.9; // Recovery week
      } else {
        multiplier = 1.0; // Build week 1
      }

      // Overall trend still upward until pump, then taper
      const overallTrend = i <= peakWeek
        ? 0.9 + (0.2 * i) / peakWeek
        : 1.0 - 0.4 * ((i - peakWeek) / (totalWeeks - peakWeek));
      multiplier = (multiplier + overallTrend) / 2;
    } else {
      // Block (default): 3-week accumulation, 1-week deload
      const blockCycle = i % 4;
      if (blockCycle === 0) {
        multiplier = 0.7; // Deload
      } else {
        multiplier = 0.9 + 0.25 * blockCycle;
      }

      // Overall trend
      const overallTrend = i <= peakWeek
        ? 0.8 + (0.25 * i) / peakWeek
        : 1.05 - 0.5 * ((i - peakWeek) / (totalWeeks - peakWeek));
      multiplier = (multiplier + overallTrend) / 2;
    }

    weeks.push(parseFloat((initialVolumeKm * multiplier).toFixed(1)));
  }

  return weeks;
}

/**
 * Convert decimal minutes to mm:ss format
 * @param {number} decimalMinutes
 * @returns {string} "mm:ss"
 */
function decimalToMinSec(decimalMinutes) {
  const minutes = Math.floor(decimalMinutes);
  const seconds = Math.round((decimalMinutes - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Convert seconds per km to min:sec/km format
 * @param {number} secPerKm
 * @returns {string} "m:ss/km"
 */
function secPerKmToMinSecFormat(secPerKm) {
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
}

/**
 * Convert min:sec/km to seconds per km
 * @param {string} timeStr - "m:ss" or "mm:ss"
 * @returns {number} seconds per km
 */
function minSecFormatToSecPerKm(timeStr) {
  const [minutes, seconds] = timeStr.split(':').map(Number);
  return minutes * 60 + seconds;
}

// ═══════════════════════════════════════════════════════════════
// Training Session Builders (adapted from training_funcs.py)
// Each returns structured session with warmup, main, cooldown phases
// ═══════════════════════════════════════════════════════════════

/**
 * Easy run session (base aerobic)
 * 10% warmup, 80% easy pace, 10% cooldown
 */
function trainingEasy(vdot, weeklyDistance, sessionNumber = 1) {
  const paces = calculatePaces(vdot);
  const sessionDistance = weeklyDistance / 4;
  const warmupCooldown = sessionDistance * 0.1;
  const easyPortion = sessionDistance * 0.8;

  return {
    type: 'easy',
    targetMetric: 'pace',
    totalDistance: sessionDistance,
    phases: [
      {
        name: 'warmup',
        distance: warmupCooldown,
        targetPaceSecPerKm: paces.easyFastSecPerKm,
        cadenceRpm: 170,
      },
      {
        name: 'easy',
        distance: easyPortion,
        targetPaceSecPerKm: paces.easySlowSecPerKm,
        cadenceRpm: 165,
      },
      {
        name: 'cooldown',
        distance: warmupCooldown,
        targetPaceSecPerKm: paces.easyFastSecPerKm,
        cadenceRpm: 165,
      },
    ],
  };
}

/**
 * Long run session (aerobic endurance)
 * 5% warmup, 85% marathon pace, 10% cooldown + mobility
 */
function trainingLongRun(vdot, weeklyDistance) {
  const paces = calculatePaces(vdot);
  const sessionDistance = weeklyDistance * 0.5; // Long run is ~50% of weekly volume
  const warmup = sessionDistance * 0.05;
  const mainPortion = sessionDistance * 0.85;
  const cooldown = sessionDistance * 0.1;

  return {
    type: 'long',
    targetMetric: 'pace',
    totalDistance: sessionDistance,
    phases: [
      {
        name: 'warmup',
        distance: warmup,
        targetPaceSecPerKm: paces.easyFastSecPerKm,
        cadenceRpm: 170,
      },
      {
        name: 'long_run',
        distance: mainPortion,
        targetPaceSecPerKm: paces.marathonSecPerKm,
        cadenceRpm: 160,
      },
      {
        name: 'cooldown',
        distance: cooldown,
        targetPaceSecPerKm: paces.easySlowSecPerKm,
        cadenceRpm: 160,
      },
    ],
  };
}

/**
 * Tempo run session (threshold/sweet spot)
 * 15% warmup, 70% threshold pace, 15% cooldown
 */
function trainingTempo(vdot, weeklyDistance) {
  const paces = calculatePaces(vdot);
  const sessionDistance = weeklyDistance * 0.25;
  const warmup = sessionDistance * 0.15;
  const mainPortion = sessionDistance * 0.7;
  const cooldown = sessionDistance * 0.15;

  return {
    type: 'tempo',
    targetMetric: 'pace',
    totalDistance: sessionDistance,
    phases: [
      {
        name: 'warmup',
        distance: warmup,
        targetPaceSecPerKm: paces.easyFastSecPerKm,
        cadenceRpm: 170,
      },
      {
        name: 'tempo',
        distance: mainPortion,
        targetPaceSecPerKm: paces.thresholdSecPerKm,
        cadenceRpm: 175,
      },
      {
        name: 'cooldown',
        distance: cooldown,
        targetPaceSecPerKm: paces.easySlowSecPerKm,
        cadenceRpm: 165,
      },
    ],
  };
}

/**
 * Long tempo run (sustained threshold)
 * 10% warmup, 75% threshold pace, 15% cooldown
 */
function trainingLongTempo(vdot, weeklyDistance) {
  const paces = calculatePaces(vdot);
  const sessionDistance = weeklyDistance * 0.3;
  const warmup = sessionDistance * 0.1;
  const mainPortion = sessionDistance * 0.75;
  const cooldown = sessionDistance * 0.15;

  return {
    type: 'tempo',
    targetMetric: 'pace',
    totalDistance: sessionDistance,
    phases: [
      {
        name: 'warmup',
        distance: warmup,
        targetPaceSecPerKm: paces.easyFastSecPerKm,
        cadenceRpm: 170,
      },
      {
        name: 'long_tempo',
        distance: mainPortion,
        targetPaceSecPerKm: paces.thresholdSecPerKm,
        cadenceRpm: 173,
      },
      {
        name: 'cooldown',
        distance: cooldown,
        targetPaceSecPerKm: paces.easyFastSecPerKm,
        cadenceRpm: 165,
      },
    ],
  };
}

/**
 * Interval run session (VO2max repeats)
 * 15% warmup, 60% intervals, 15% cooldown
 * Intervals: 5-7 × 5min at I pace
 */
function trainingInterval(vdot, weeklyDistance) {
  const paces = calculatePaces(vdot);
  const sessionDistance = weeklyDistance * 0.2;
  const warmup = sessionDistance * 0.15;
  const cooldown = sessionDistance * 0.15;
  const intervalPortion = sessionDistance * 0.7;

  return {
    type: 'interval',
    targetMetric: 'pace',
    totalDistance: sessionDistance,
    intervals: {
      count: 6,
      duration: 300, // 5 minutes
      paceSecPerKm: paces.intervalSecPerKm,
      recoveryPaceSecPerKm: paces.easyFastSecPerKm,
      recoveryDuration: 120, // 2 minutes
    },
    phases: [
      {
        name: 'warmup',
        distance: warmup,
        targetPaceSecPerKm: paces.easyFastSecPerKm,
        cadenceRpm: 170,
      },
      {
        name: 'intervals',
        targetPaceSecPerKm: paces.intervalSecPerKm,
        cadenceRpm: 180,
        structure: '6 × 5min @ I pace / 2min recovery',
      },
      {
        name: 'cooldown',
        distance: cooldown,
        targetPaceSecPerKm: paces.easySlowSecPerKm,
        cadenceRpm: 160,
      },
    ],
  };
}

/**
 * Repetition run session (max sustainable velocity)
 * 15% warmup, 60% reps, 15% cooldown
 * Reps: 8-12 × 2-3min at RR pace
 */
function trainingRepetition(vdot, weeklyDistance) {
  const paces = calculatePaces(vdot);
  const sessionDistance = weeklyDistance * 0.15;
  const warmup = sessionDistance * 0.15;
  const cooldown = sessionDistance * 0.15;

  return {
    type: 'repetition',
    targetMetric: 'pace',
    totalDistance: sessionDistance,
    intervals: {
      count: 10,
      duration: 180, // 3 minutes
      paceSecPerKm: paces.rrSecPerKm,
      recoveryPaceSecPerKm: paces.easyFastSecPerKm,
      recoveryDuration: 90, // 1.5 minutes
    },
    phases: [
      {
        name: 'warmup',
        distance: warmup,
        targetPaceSecPerKm: paces.easyFastSecPerKm,
        cadenceRpm: 170,
      },
      {
        name: 'repetitions',
        targetPaceSecPerKm: paces.rrSecPerKm,
        cadenceRpm: 185,
        structure: '10 × 3min @ RR pace / 1.5min recovery',
      },
      {
        name: 'cooldown',
        distance: cooldown,
        targetPaceSecPerKm: paces.easySlowSecPerKm,
        cadenceRpm: 160,
      },
    ],
  };
}

/**
 * Combined workout (combines multiple training effects)
 * Can be tempo + intervals, or long run + strides, etc.
 */
function trainingCombo(vdot, weeklyDistance, comboType = 'tempo_intervals') {
  const paces = calculatePaces(vdot);
  const sessionDistance = weeklyDistance * 0.25;

  if (comboType === 'tempo_intervals') {
    // Tempo + short intervals
    return {
      type: 'combo',
      variant: 'tempo_intervals',
      totalDistance: sessionDistance,
      phases: [
        {
          name: 'warmup',
          distance: sessionDistance * 0.1,
          targetPaceSecPerKm: paces.easyFastSecPerKm,
          cadenceRpm: 170,
        },
        {
          name: 'tempo',
          distance: sessionDistance * 0.4,
          targetPaceSecPerKm: paces.thresholdSecPerKm,
          cadenceRpm: 175,
        },
        {
          name: 'intervals',
          targetPaceSecPerKm: paces.intervalSecPerKm,
          structure: '4 × 3min @ I pace / 2min recovery',
          cadenceRpm: 180,
        },
        {
          name: 'cooldown',
          distance: sessionDistance * 0.1,
          targetPaceSecPerKm: paces.easySlowSecPerKm,
          cadenceRpm: 160,
        },
      ],
    };
  }

  return {
    type: 'combo',
    variant: comboType,
    totalDistance: sessionDistance,
  };
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  ENGINE_VERSION,
  calculateVDOT,
  calculatePaces,
  computeZonesFromVdot,
  assignAthleteLevel,
  calculateInitialVolume,
  phaseWeeklyDistances,
  decimalToMinSec,
  secPerKmToMinSecFormat,
  minSecFormatToSecPerKm,
  trainingEasy,
  trainingLongRun,
  trainingTempo,
  trainingLongTempo,
  trainingInterval,
  trainingRepetition,
  trainingCombo,
};
