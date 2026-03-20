// ─── VDOT calculations ── mirrors aer-backend/athlete_funcs.py ───────────────

export type AthleteLevel =
  | "Beginner"
  | "Novice"
  | "Intermediate"
  | "Advanced"
  | "Elite";

// ── Core formulas ─────────────────────────────────────────────────────────────

/**
 * Jack Daniels VDOT from a race result.
 * raceDistKm  — distance in km
 * raceTimeMin — finishing time in decimal minutes
 */
export function calculateVDOT(
  raceDistKm: number,
  raceTimeMin: number
): number {
  if (raceTimeMin <= 0 || raceDistKm <= 0) return 0;
  const speed = (raceDistKm * 1000) / raceTimeMin; // m/min
  const vo2MaxPercent =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * raceTimeMin) +
    0.2989558 * Math.exp(-0.1932605 * raceTimeMin);
  const vdot =
    (-4.6 + 0.182258 * speed + 0.000104 * speed * speed) / vo2MaxPercent;
  return Number.isFinite(vdot) && vdot > 0 ? vdot : 0;
}

/**
 * Pace (min/km) from VDOT at intensity fraction k.
 * k = 0.88 → threshold | 0.70 → easy-fast | 0.62 → easy-slow
 */
export function paceFromVdot(vdot: number, k: number): number {
  const v = vdot * k;
  return 1000 / (29.54 + 5.000663 * v - 0.007546 * v * v);
}

/**
 * Reverse a pace (min/km) to VDOT using the quadratic inverse.
 * Takes the physically meaningful (smaller) root.
 */
function vdotFromPaceAtK(paceMinPerKm: number, k: number): number {
  if (paceMinPerKm <= 0) return 0;
  const D = 1000 / paceMinPerKm; // target denominator
  const c = D - 29.54;
  const discriminant = 5.000663 * 5.000663 - 4 * 0.007546 * c;
  if (discriminant < 0) return 0;
  const v = (5.000663 - Math.sqrt(discriminant)) / (2 * 0.007546);
  const vdot = v / k;
  return Number.isFinite(vdot) && vdot > 0 ? vdot : 0;
}

/** Estimate VDOT from threshold pace (min/km). */
export function vdotFromThresholdPace(paceMinPerKm: number): number {
  return vdotFromPaceAtK(paceMinPerKm, 0.88);
}

/** Estimate VDOT from easy (slow) pace (min/km). */
export function vdotFromEasyPace(paceMinPerKm: number): number {
  return vdotFromPaceAtK(paceMinPerKm, 0.62);
}

/**
 * Binary-search for the 5 km race time (minutes) that yields a given VDOT.
 * Used when we know VDOT from pace/tier and need race_dist + race_time for
 * the plan API.
 */
export function syntheticRaceTimeForVdot(
  vdot: number,
  distKm = 5
): number {
  if (vdot <= 0) return 60;
  // VDOT is monotonically decreasing as race time increases
  let lo = 8; // fastest imaginable 5 km
  let hi = 180;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    calculateVDOT(distKm, mid) > vdot ? (lo = mid) : (hi = mid);
  }
  return Math.round(((lo + hi) / 2) * 1000) / 1000; // 3 decimal places
}

// ── Level assignment ──────────────────────────────────────────────────────────

/** Map VDOT to a training level — mirrors assignATHLETELEVEL in Python. */
export function vdotToLevel(vdot: number): AthleteLevel {
  if (vdot < 33) return "Beginner";
  if (vdot < 40) return "Novice";
  if (vdot < 52) return "Intermediate";
  if (vdot < 58) return "Advanced";
  return "Elite";
}

export const LEVEL_LABELS: Record<AthleteLevel, string> = {
  Beginner: "Beginner · Iniciante",
  Novice: "Novice · Novato",
  Intermediate: "Intermediate · Intermédio",
  Advanced: "Advanced · Avançado",
  Elite: "Elite",
};

// ── Progression matrix ────────────────────────────────────────────────────────

export type ProgressionKey = "conservative" | "intermediate" | "aggressive";

export type ProgressionOption = {
  key: ProgressionKey;
  label: string;
  sublabel: string;
  value: number;
};

/**
 * Returns the three progression options for a given athlete level.
 * Values match the table from the original Google Forms flow:
 *
 *            Conservador  Intermédio  Agressivo
 * Beginner     7.5 %       10 %       12.5 %
 * Novice       5 %          7.5 %     10 %
 * Intermediate 2.5 %        5 %        7.5 %
 * Advanced     2.5 %        5 %        7.5 %
 * Elite        2.5 %        5 %        7.5 %
 */
export function progressionOptions(level: AthleteLevel): ProgressionOption[] {
  const matrix: Record<AthleteLevel, [number, number, number]> = {
    Beginner:     [0.075, 0.10,  0.125],
    Novice:       [0.05,  0.075, 0.10],
    Intermediate: [0.025, 0.05,  0.075],
    Advanced:     [0.025, 0.05,  0.075],
    Elite:        [0.025, 0.05,  0.075],
  };
  const [cons, inter, agr] = matrix[level];
  const fmt = (v: number) => `+${(v * 100).toFixed(1).replace(".0", "")}%/sem`;
  return [
    { key: "conservative",  label: "Conservador", sublabel: fmt(cons),  value: cons  },
    { key: "intermediate",  label: "Intermédio",  sublabel: fmt(inter), value: inter },
    { key: "aggressive",    label: "Agressivo",   sublabel: fmt(agr),   value: agr   },
  ];
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Format decimal min/km as "M:SS". */
export function formatMinPerKm(minPerKm: number): string {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return "--:--";
  const totalSec = Math.round(minPerKm * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── VDOT tier table ───────────────────────────────────────────────────────────

export type VdotTier = {
  vdot: number;
  level: AthleteLevel;
  description: string;
  easyPace: string; // "M:SS/km" of easy-slow pace
};

const TIER_DESCRIPTIONS: Record<number, string> = {
  30: "Comecei a correr recentemente ou voltei depois de uma longa pausa.",
  32: "Corro há poucos meses sem muita regularidade. 5 km com esforço elevado.",
  34: "Corro regularmente há 6+ meses. Consigo completar 5 km sem parar.",
  36: "Corro há cerca de 1 ano com alguma consistência. 5 km entre 30-33 min.",
  38: "Corro há 1-2 anos. 5 km entre 27-30 min, com base aeróbia sólida.",
  40: "Corro há mais de 2 anos com treino estruturado. 5 km abaixo dos 27 min.",
  42: "Atleta regular com bom volume semanal. 5 km entre 23-25 min.",
  44: "Atleta consistente, participei em várias provas. 5 km entre 21-23 min.",
  46: "Corredor experiente e competitivo. 5 km entre 20-22 min.",
  48: "Atleta de alto rendimento. 5 km abaixo dos 20 min, volume semanal elevado.",
};

/**
 * 10 descriptive VDOT tiers (30–48, step 2) for users without race data.
 * Easy pace shown is the slow easy pace (k = 0.62).
 */
export const VDOT_TIERS: VdotTier[] = [
  30, 32, 34, 36, 38, 40, 42, 44, 46, 48,
].map((v) => ({
  vdot: v,
  level: vdotToLevel(v),
  description: TIER_DESCRIPTIONS[v],
  easyPace: formatMinPerKm(paceFromVdot(v, 0.62)),
}));
