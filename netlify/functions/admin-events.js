const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  listTrainingEvents,
  listTrainingPrograms,
  getTrainingEventById,
  createTrainingEvent,
  updateTrainingEvent,
  updateTrainingProgram
} = require("./_lib/supabase");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeString(value) {
  if (value == null) return null;
  const next = String(value).trim();
  return next || null;
}

function parseBoolean(value, fieldName) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(lower)) return true;
    if (["false", "0", "no", "off"].includes(lower)) return false;
  }
  throw new Error(`${fieldName} must be a boolean`);
}

function parseDate(value, fieldName) {
  const normalized = normalizeString(value);
  if (normalized == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format`);
  }
  return normalized;
}

function parseRank(value, fieldName) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return parsed;
}

function calculateProgramStartDate(eventDate, durationWeeks) {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(eventDate))) return null;
  const weeks = Number(durationWeeks);
  if (!Number.isInteger(weeks) || weeks <= 0) return null;
  const date = new Date(`${eventDate}T00:00:00Z`);
  const weekday = date.getUTCDay(); // 0=Sunday, 1=Monday, ...
  const shiftToMonday = (weekday + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shiftToMonday);
  date.setUTCDate(date.getUTCDate() - ((weeks - 1) * 7));
  return date.toISOString().slice(0, 10);
}

function mapEvent(row) {
  return {
    id: row.id,
    name: row.name || null,
    event_date: row.event_date || null,
    event_location: row.event_location || null,
    event_description: row.event_description || null,
    calendar_visible: row.calendar_visible !== false,
    calendar_highlight_rank: Number.isInteger(row.calendar_highlight_rank) ? row.calendar_highlight_rank : null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

function mapProgram(row) {
  return {
    id: row.id,
    name: row.name || null,
    status: row.status || null,
    event_id: row.event_id || null,
    start_date: row.start_date || null,
    duration_weeks: Number.isInteger(row.duration_weeks) ? row.duration_weeks : null,
    price_cents: Number.isInteger(row.price_cents) ? row.price_cents : null,
    currency: row.currency || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

async function syncProgramsForEvent(config, eventId, eventRow) {
  const programsRows = await listTrainingPrograms(config);
  const programs = Array.isArray(programsRows) ? programsRows : [];
  const linkedPrograms = programs.filter((program) => program && program.event_id === eventId);

  await Promise.all(linkedPrograms.map((program) => updateTrainingProgram(config, program.id, {
    start_date: eventRow ? calculateProgramStartDate(eventRow.event_date, program.duration_weeks) : program.start_date || null
  })));

  return linkedPrograms.length;
}

function compareEvents(a, b) {
  const rankA = Number.isInteger(a.calendar_highlight_rank) ? a.calendar_highlight_rank : Number.MAX_SAFE_INTEGER;
  const rankB = Number.isInteger(b.calendar_highlight_rank) ? b.calendar_highlight_rank : Number.MAX_SAFE_INTEGER;
  if (rankA !== rankB) return rankA - rankB;

  const dateA = a.event_date || "9999-12-31";
  const dateB = b.event_date || "9999-12-31";
  if (dateA !== dateB) return dateA.localeCompare(dateB);

  return String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" });
}

function ensureUuid(value, fieldName) {
  const normalized = normalizeString(value);
  if (!normalized || !UUID_RE.test(normalized)) {
    throw new Error(`${fieldName} must be a valid UUID`);
  }
  return normalized;
}

function normalizeCreatePayload(payload) {
  const name = normalizeString(payload.name);
  if (!name) throw new Error("name is required");

  const body = {
    name,
    event_date: parseDate(payload.event_date, "event_date"),
    event_location: normalizeString(payload.event_location),
    event_description: normalizeString(payload.event_description),
    calendar_visible: hasOwn(payload, "calendar_visible")
      ? parseBoolean(payload.calendar_visible, "calendar_visible")
      : true,
    calendar_highlight_rank: parseRank(payload.calendar_highlight_rank, "calendar_highlight_rank")
  };

  return body;
}

function normalizePatchPayload(payload) {
  const patch = {};

  if (hasOwn(payload, "name")) {
    const name = normalizeString(payload.name);
    if (!name) throw new Error("name cannot be empty");
    patch.name = name;
  }
  if (hasOwn(payload, "event_date")) {
    patch.event_date = parseDate(payload.event_date, "event_date");
  }
  if (hasOwn(payload, "event_location")) {
    patch.event_location = normalizeString(payload.event_location);
  }
  if (hasOwn(payload, "event_description")) {
    patch.event_description = normalizeString(payload.event_description);
  }
  if (hasOwn(payload, "calendar_visible")) {
    patch.calendar_visible = parseBoolean(payload.calendar_visible, "calendar_visible");
  }
  if (hasOwn(payload, "calendar_highlight_rank")) {
    patch.calendar_highlight_rank = parseRank(payload.calendar_highlight_rank, "calendar_highlight_rank");
  }

  if (!Object.keys(patch).length) {
    throw new Error("No valid fields provided for update");
  }

  return patch;
}

function buildProgramsByEvent(programs, events) {
  const byEvent = {};
  const eventIds = Array.isArray(events) ? events.map((eventRow) => eventRow.id).filter(Boolean) : [];

  for (const id of eventIds) {
    byEvent[id] = 0;
  }

  for (const program of programs || []) {
    if (!program || !program.event_id) continue;
    byEvent[program.event_id] = (byEvent[program.event_id] || 0) + 1;
  }

  return byEvent;
}

async function handleList(config) {
  const [eventsRows, programsRows] = await Promise.all([
    listTrainingEvents(config),
    listTrainingPrograms(config)
  ]);

  const events = (Array.isArray(eventsRows) ? eventsRows : []).map(mapEvent).sort(compareEvents);
  const programs = Array.isArray(programsRows) ? programsRows : [];

  return json(200, {
    events,
    programs_by_event: buildProgramsByEvent(programs, events)
  });
}

async function handleGetById(config, eventId) {
  const eventRow = await getTrainingEventById(config, eventId);
  if (!eventRow) return json(404, { error: "Event not found" });

  const programsRows = await listTrainingPrograms(config);
  const programs = (Array.isArray(programsRows) ? programsRows : [])
    .filter((program) => program && program.event_id === eventId)
    .map(mapProgram)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" }));

  return json(200, {
    event: mapEvent(eventRow),
    programs,
    programs_count: programs.length
  });
}

async function handleCreate(config, event) {
  const payload = parseJsonBody(event);
  const body = normalizeCreatePayload(payload);
  const created = await createTrainingEvent(config, body);

  return json(201, {
    event: mapEvent(created || body),
    message: "Event created successfully"
  });
}

async function handlePatch(config, eventId, event) {
  const existing = await getTrainingEventById(config, eventId);
  if (!existing) return json(404, { error: "Event not found" });

  const payload = parseJsonBody(event);
  const patch = normalizePatchPayload(payload);
  const updated = await updateTrainingEvent(config, eventId, patch);
  await syncProgramsForEvent(config, eventId, updated || { ...existing, ...patch });

  return json(200, {
    event: mapEvent(updated || { ...existing, ...patch }),
    message: "Event updated successfully"
  });
}

async function handleDelete(config, eventId) {
  const existing = await getTrainingEventById(config, eventId);
  if (!existing) return json(404, { error: "Event not found" });

  const programsRows = await listTrainingPrograms(config);
  const programs = Array.isArray(programsRows) ? programsRows : [];
  const linkedPrograms = programs.filter((program) => program && program.event_id === eventId);

  await Promise.all(linkedPrograms.map((program) => updateTrainingProgram(config, program.id, {
    event_id: null
  })));

  await updateTrainingEvent(config, eventId, {
    deleted_at: new Date().toISOString()
  });

  return json(200, {
    message: "Event deleted successfully"
  });
}

async function handleReorder(config, event) {
  const payload = parseJsonBody(event);
  if (!Array.isArray(payload)) {
    return json(400, { error: "Body must be an array of reorder items" });
  }

  for (const item of payload) {
    if (!item || typeof item !== "object") {
      return json(400, { error: "Each reorder item must be an object" });
    }
  }

  let updatedCount = 0;

  for (const item of payload) {
    let targetEventId;
    let rank;

    try {
      targetEventId = ensureUuid(item.eventId, "eventId");
      rank = parseRank(item.calendar_highlight_rank, "calendar_highlight_rank");
      if (rank == null) {
        throw new Error("calendar_highlight_rank is required for reorder");
      }
    } catch (err) {
      return json(400, { error: err.message || "Invalid reorder payload" });
    }

    const existing = await getTrainingEventById(config, targetEventId);
    if (!existing) {
      return json(404, { error: `Event not found: ${targetEventId}` });
    }

    const updated = await updateTrainingEvent(config, targetEventId, {
      calendar_highlight_rank: rank
    });

    if (updated) updatedCount += 1;
  }

  return json(200, {
    updated_count: updatedCount,
    message: "Events reordered successfully"
  });
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const query = event.queryStringParameters || {};

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    if (method === "GET") {
      if (hasOwn(query, "eventId")) {
        const eventId = ensureUuid(query.eventId, "eventId");
        return handleGetById(config, eventId);
      }
      return handleList(config);
    }

    if (method === "POST") {
      return handleCreate(config, event);
    }

    if (method === "PATCH") {
      if (query.action === "reorder") {
        return handleReorder(config, event);
      }

      const eventId = ensureUuid(query.eventId, "eventId");
      return handlePatch(config, eventId, event);
    }

    if (method === "DELETE") {
      const eventId = ensureUuid(query.eventId, "eventId");
      return handleDelete(config, eventId);
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const message = err && err.message ? err.message : "Unexpected error";
    if (
      message === "Invalid JSON body" ||
      message.includes("required") ||
      message.includes("must be") ||
      message.includes("No valid fields") ||
      message.includes("cannot be empty")
    ) {
      return json(400, { error: message });
    }

    console.error("[admin-events]", err);
    return json(500, { error: "Internal server error" });
  }
};
