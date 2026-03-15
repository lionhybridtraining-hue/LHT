const zlib = require("zlib");
const { toIsoDate } = require("./date");

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

function mapTrainingPeaksRecord(record, athleteId) {
  const date = firstValidDate(record);
  if (!date) return null;

  const workoutType = record["workouttype"] || record["workout type"];
  const rawDuration =
    record["time total in hours"] ||
    record["timetotalinhours"] ||
    record["duration"] ||
    record["elapsed time"] ||
    record["plannedduration"];

  return {
    athlete_id: athleteId,
    session_date: date,
    title: record["title"] || record["workout name"] || record["workout"] || "Sessao",
    sport_type: record["type"] || record["sport"] || workoutType || null,
    duration_minutes: toMinutes(rawDuration),
    tss: toNumber(record["tss"]),
    intensity_factor: toNumber(record["if"] || record["intensity factor"]),
    ctl: toNumber(record["ctl"]),
    atl: toNumber(record["atl"]),
    tsb: toNumber(record["tsb"]),
    avg_heart_rate: toNumber(record["average heart rate"] || record["avg heart rate"]),
    avg_power: toNumber(record["average power"] || record["avg power"]),
    distance_km: toNumber(record["distance"]),
    avg_pace: record["average pace"] || record["pace"] || null,
    raw_row: record
  };
}

module.exports = {
  csvTextFromPayload,
  parseCsv,
  mapTrainingPeaksRecord
};
