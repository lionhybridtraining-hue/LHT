const zlib = require("zlib");
const { toIsoDate } = require("./date");

const CLASSIFICATION_VERSION = 1;
const DONE_THRESHOLD_RATIO = 0.8;

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function detectDelimiter(text) {
  const sample = (text || "").split(/\r?\n/).slice(0, 5).join("\n");
  const semicolons = (sample.match(/;/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

function parseCsv(text, delimiter) {
  const rows = [];
  const delim = delimiter || detectDelimiter(text);
  let current = "";
  let inQuotes = false;
  let row = [];

  const pushCell = () => {
    row.push(current);
    current = "";
  };

  const pushRow = () => {
    if (row.length === 1 && row[0].trim() === "") {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delim) {
      pushCell();
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      pushCell();
      pushRow();
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    pushCell();
    pushRow();
  }

  if (!rows.length) return { headers: [], records: [] };

  const headers = rows[0].map(normalizeHeader);
  const records = rows.slice(1).map((cells) => {
    const out = {};
    for (let i = 0; i < headers.length; i += 1) {
      out[headers[i]] = (cells[i] || "").trim();
    }
    return out;
  });

  return { headers, records };
}

function csvTextFromPayload({ csvText, gzBase64 }) {
  if (csvText && typeof csvText === "string") return csvText;

  if (gzBase64 && typeof gzBase64 === "string") {
    const compressed = Buffer.from(gzBase64, "base64");
    return zlib.gunzipSync(compressed).toString("utf8");
  }

  throw new Error("Missing csvText or gzBase64 payload");
}

function firstValidDate(record) {
  const candidates = [
    record["workout date"],
    record["workoutday"],
    record["workout day"],
    record["date"],
    record["activity date"],
    record["day"]
  ];

  for (const value of candidates) {
    const iso = toIsoDate(value);
    if (iso) return iso;
  }

  return null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function hasPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roundNumber(value, digits) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toMinutes(durationText) {
  if (!durationText) return null;

  // TrainingPeaks exports can provide decimal hours (e.g. 0.7235)
  const direct = Number(String(durationText).replace(",", "."));
  if (Number.isFinite(direct)) {
    return Math.round(direct * 60);
  }

  const parts = String(durationText).split(":").map((n) => Number(n));
  if (parts.some((n) => Number.isNaN(n))) return null;

  if (parts.length === 3) {
    return Math.round(((parts[0] * 3600) + (parts[1] * 60) + parts[2]) / 60);
  }

  if (parts.length === 2) {
    return Math.round(((parts[0] * 60) + parts[1]) / 60);
  }

  return null;
}

function normalizeSessionTitle(title) {
  return String(title || "Sessao")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeSportType(sportType) {
  return String(sportType || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toSessionContextKey(title, sportType) {
  return `${normalizeSessionTitle(title)}::${normalizeSportType(sportType)}`;
}

function classifyExecutionStatus({
  plannedDurationMinutes,
  plannedDistanceMeters,
  actualDurationMinutes,
  actualDistanceMeters,
  tss
}) {
  const hasPlanned = hasPositiveNumber(plannedDurationMinutes) || hasPositiveNumber(plannedDistanceMeters);
  const hasActual = hasPositiveNumber(actualDurationMinutes) || hasPositiveNumber(actualDistanceMeters) || hasPositiveNumber(tss);

  if (!hasPlanned && !hasActual) {
    return { executionStatus: "ignored_empty_row", executionRatio: null };
  }

  if (!hasPlanned && hasActual) {
    return { executionStatus: "done_not_planned", executionRatio: null };
  }

  if (hasPlanned && !hasActual) {
    return { executionStatus: "planned_not_done", executionRatio: null };
  }

  let ratio = null;
  if (hasPositiveNumber(plannedDurationMinutes) && typeof actualDurationMinutes === "number") {
    ratio = actualDurationMinutes / plannedDurationMinutes;
  } else if (hasPositiveNumber(plannedDistanceMeters) && typeof actualDistanceMeters === "number") {
    ratio = actualDistanceMeters / plannedDistanceMeters;
  }

  const executionRatio = ratio === null ? null : roundNumber(ratio, 3);
  if (executionRatio === null) {
    return { executionStatus: "planned_done", executionRatio: null };
  }

  if (executionRatio >= DONE_THRESHOLD_RATIO) {
    return { executionStatus: "planned_done", executionRatio };
  }

  if (executionRatio > 0) {
    return { executionStatus: "planned_partially_done", executionRatio };
  }

  return { executionStatus: "planned_not_done", executionRatio };
}

function mapTrainingPeaksRecord(record, athleteId) {
  const date = firstValidDate(record);
  if (!date) return null;

  const title = record["title"] || record["workout name"] || record["workout"] || "Sessao";
  const workoutType = record["workouttype"] || record["workout type"] || record["type"] || record["sport"] || "";
  const plannedDurationMinutes = toMinutes(record["plannedduration"] || record["planned duration"]);
  const actualDurationMinutes = toMinutes(
    record["time total in hours"] ||
    record["timetotalinhours"] ||
    record["duration"] ||
    record["elapsed time"]
  );
  const plannedDistanceMeters = toNumber(record["planneddistanceinmeters"] || record["planned distance in meters"]);
  const actualDistanceMeters = toNumber(record["distanceinmeters"] || record["distance in meters"]);
  const tss = toNumber(record["tss"]);
  const { executionStatus, executionRatio } = classifyExecutionStatus({
    plannedDurationMinutes,
    plannedDistanceMeters,
    actualDurationMinutes,
    actualDistanceMeters,
    tss
  });
  const normalizedTitle = normalizeSessionTitle(title);

  return {
    athlete_id: athleteId,
    session_date: date,
    title,
    sport_type: workoutType || null,
    duration_minutes: actualDurationMinutes,
    planned_duration_minutes: plannedDurationMinutes,
    planned_distance_meters: plannedDistanceMeters,
    actual_duration_minutes: actualDurationMinutes,
    actual_distance_meters: actualDistanceMeters,
    tss,
    intensity_factor: toNumber(record["if"] || record["intensity factor"]),
    ctl: toNumber(record["ctl"]),
    atl: toNumber(record["atl"]),
    tsb: toNumber(record["tsb"]),
    avg_heart_rate: toNumber(record["average heart rate"] || record["avg heart rate"]),
    avg_power: toNumber(record["average power"] || record["avg power"]),
    distance_km: hasPositiveNumber(actualDistanceMeters) ? roundNumber(actualDistanceMeters / 1000, 2) : toNumber(record["distance"]),
    avg_pace: record["average pace"] || record["pace"] || null,
    execution_status: executionStatus,
    execution_ratio: executionRatio,
    context_class: "unknown",
    normalized_title: normalizedTitle,
    classification_version: CLASSIFICATION_VERSION,
    raw_row: record
  };
}

module.exports = {
  CLASSIFICATION_VERSION,
  csvTextFromPayload,
  parseCsv,
  mapTrainingPeaksRecord,
  normalizeSessionTitle
};
