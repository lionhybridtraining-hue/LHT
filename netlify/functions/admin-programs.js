const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listTrainingPrograms, createTrainingProgram, updateTrainingProgram } = require("./_lib/supabase");
const { createStripeProductAndPrice, getStripeClient, syncStripeStatus } = require("./_lib/stripe");

const DEFAULT_EXTERNAL_SOURCE = "lht";
const MAX_EXTERNAL_ID_LENGTH = 64;
const MONTH_TOKENS_PT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function normalizeExternalSource(value) {
  return String(value || DEFAULT_EXTERNAL_SOURCE).trim().toLowerCase() || DEFAULT_EXTERNAL_SOURCE;
}

function normalizeExternalIdForComparison(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeFreeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function buildExternalIdToken(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase();
  if (!normalized) return "PROGRAM";
  return normalized.slice(0, MAX_EXTERNAL_ID_LENGTH);
}

function buildCandidateWithSuffix(base, suffixNumber) {
  if (suffixNumber <= 1) return base;
  const suffix = `_${suffixNumber}`;
  const maxBaseLen = Math.max(1, MAX_EXTERNAL_ID_LENGTH - suffix.length);
  return `${base.slice(0, maxBaseLen)}${suffix}`;
}

function extractMonthToken(eventDate) {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return "";
  const month = Number(eventDate.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return "";
  return MONTH_TOKENS_PT[month - 1];
}

function extractRaceToken({ name, eventName }) {
  const text = normalizeFreeText(`${eventName || ""} ${name || ""}`).toUpperCase();
  if (!text) return "";

  const kmMatch = text.match(/\b(\d{1,2}(?:[\.,]\d)?)\s*K\b/);
  if (kmMatch && kmMatch[1]) {
    return `${kmMatch[1].replace(",", ".").replace(/\.0$/, "")}K`;
  }

  if (/\b(MEIA|HALF|HM|21K|21\.1K?)\b/.test(text)) return "HM";
  if (/\b(MARATONA|MARATHON|42K|42\.2K?)\b/.test(text)) return "MAR";
  if (/\b(TRAIL)\b/.test(text)) return "TRAIL";
  if (/\b(ULTRA)\b/.test(text)) return "ULTRA";
  return "";
}

function extractShortNameToken({ name, eventName }) {
  const source = normalizeFreeText(eventName || name).toUpperCase();
  if (!source) return "PROGRAM";

  const words = source
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .filter((word) => !["DE", "DA", "DO", "DOS", "DAS", "E", "A", "O", "THE", "AND", "PROGRAMA", "PLANO"].includes(word));

  if (!words.length) return "PROGRAM";
  if (words.length === 1) return words[0].slice(0, 6);
  return words.slice(0, 4).map((word) => word[0]).join("");
}

function buildExternalIdBase({ name, eventName, eventDate, durationWeeks }) {
  const shortToken = buildExternalIdToken(extractShortNameToken({ name, eventName }));
  const raceToken = buildExternalIdToken(extractRaceToken({ name, eventName }));
  const durationToken = Number.isInteger(Number(durationWeeks)) && Number(durationWeeks) > 0
    ? `W${String(Number(durationWeeks)).padStart(2, "0")}`
    : "";
  const monthToken = buildExternalIdToken(extractMonthToken(eventDate));

  const parts = [shortToken, raceToken, durationToken, monthToken].filter(Boolean);
  const base = parts.join("_");
  return base ? base.slice(0, MAX_EXTERNAL_ID_LENGTH) : "PROGRAM";
}

function reserveUniqueExternalId({
  existingPrograms,
  externalSource,
  preferredExternalId,
  baseName,
  eventName,
  eventDate,
  durationWeeks,
  currentProgramId
}) {
  const source = normalizeExternalSource(externalSource);
  const used = new Set(
    (Array.isArray(existingPrograms) ? existingPrograms : [])
      .filter((program) => program && program.id !== currentProgramId)
      .filter((program) => normalizeExternalSource(program.external_source) === source)
      .map((program) => normalizeExternalIdForComparison(program.external_id))
      .filter(Boolean)
  );

  const preferred = preferredExternalId == null ? "" : String(preferredExternalId).trim();
  const preferredCmp = normalizeExternalIdForComparison(preferred);
  if (preferredCmp && !used.has(preferredCmp)) {
    return preferred;
  }

  const base = buildExternalIdBase({
    name: preferred || baseName || "PROGRAM",
    eventName,
    eventDate,
    durationWeeks
  });

  for (let i = 1; i <= 9999; i += 1) {
    const candidate = buildCandidateWithSuffix(base, i);
    if (!used.has(normalizeExternalIdForComparison(candidate))) {
      return candidate;
    }
  }

  throw new Error("Unable to generate a unique external_id");
}

function normalizeProgramPayload(payload) {
  const name = (payload.name || "").toString().trim();
  const externalSource = normalizeExternalSource(payload.externalSource);
  const externalId = payload.externalId == null ? null : payload.externalId.toString().trim() || null;
  const description = payload.description == null ? null : payload.description.toString();
  const imageUrlRaw = payload.imageUrl == null ? payload.image_url : payload.imageUrl;
  const imageUrl = imageUrlRaw == null ? null : imageUrlRaw.toString().trim() || null;
  const durationWeeks = Number(payload.durationWeeks);
  const priceCents = Number(payload.priceCents ?? 0);
  const currency = (payload.currency || "EUR").toString().trim().toUpperCase() || "EUR";
  const stripeProductId = payload.stripeProductId == null ? null : payload.stripeProductId.toString().trim() || null;
  const stripePriceId = payload.stripePriceId == null ? null : payload.stripePriceId.toString().trim() || null;
  const billingType = (payload.billingType || "one_time").toString().trim().toLowerCase() || "one_time";
  const accessModel = (payload.accessModel || "coached_one_time").toString().trim().toLowerCase() || "coached_one_time";
  const status = (payload.status || "draft").toString().trim().toLowerCase();
  const eventDateRaw = payload.eventDate == null ? payload.event_date : payload.eventDate;
  const eventDate = eventDateRaw == null ? null : eventDateRaw.toString().trim() || null;
  const eventNameRaw = payload.eventName == null ? payload.event_name : payload.eventName;
  const eventName = eventNameRaw == null ? null : eventNameRaw.toString().trim() || null;
  const eventLocationRaw = payload.eventLocation == null ? payload.event_location : payload.eventLocation;
  const eventLocation = eventLocationRaw == null ? null : eventLocationRaw.toString().trim() || null;
  const eventDescriptionRaw = payload.eventDescription == null ? payload.event_description : payload.eventDescription;
  const eventDescription = eventDescriptionRaw == null ? null : eventDescriptionRaw.toString().trim() || null;
  const calendarVisibleRaw = payload.calendarVisible == null ? payload.calendar_visible : payload.calendarVisible;
  const calendarVisible = calendarVisibleRaw == null
    ? true
    : (typeof calendarVisibleRaw === "boolean" ? calendarVisibleRaw : calendarVisibleRaw !== "false");
  const rankRaw = payload.calendarHighlightRank == null ? payload.calendar_highlight_rank : payload.calendarHighlightRank;
  const calendarHighlightRank = rankRaw == null || rankRaw === "" ? null : Number(rankRaw);

  if (!name) throw new Error("name is required");
  if (!Number.isInteger(durationWeeks) || durationWeeks <= 0) throw new Error("durationWeeks must be a positive integer");
  if (!Number.isInteger(priceCents) || priceCents < 0) throw new Error("priceCents must be a non-negative integer");
  if (!["one_time", "recurring"].includes(billingType)) throw new Error("billingType must be one_time or recurring");
  if (!["self_serve", "coached_one_time", "coached_recurring"].includes(accessModel)) {
    throw new Error("accessModel must be self_serve, coached_one_time or coached_recurring");
  }
  if (accessModel === "coached_recurring" && billingType !== "recurring") {
    throw new Error("accessModel coached_recurring requires billingType recurring");
  }
  if (!["draft", "active", "archived"].includes(status)) throw new Error("status must be draft, active or archived");
  if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new Error("eventDate must be in YYYY-MM-DD format");
  if (calendarHighlightRank != null && (!Number.isInteger(calendarHighlightRank) || calendarHighlightRank < 0)) {
    throw new Error("calendarHighlightRank must be a non-negative integer");
  }

  const presetSelectionRaw = (payload.presetSelection || payload.preset_selection || "").toString().trim().toLowerCase();
  const presetSelection = presetSelectionRaw && ["coach", "athlete"].includes(presetSelectionRaw)
    ? presetSelectionRaw
    : "athlete";

  return {
    name,
    external_source: externalSource,
    external_id: externalId,
    description,
    image_url: imageUrl,
    duration_weeks: durationWeeks,
    price_cents: priceCents,
    currency,
    stripe_product_id: stripeProductId,
    stripe_price_id: stripePriceId,
    billing_type: billingType,
    access_model: accessModel,
    status,
    event_date: eventDate,
    event_name: eventName,
    event_location: eventLocation,
    event_description: eventDescription,
    calendar_visible: calendarVisible,
    calendar_highlight_rank: calendarHighlightRank,
    preset_selection: presetSelection
  };
}

function mapProgram(row) {
  return {
    id: row.id,
    name: row.name,
    externalSource: row.external_source,
    externalId: row.external_id,
    description: row.description,
    imageUrl: row.image_url || null,
    durationWeeks: row.duration_weeks,
    priceCents: row.price_cents,
    currency: row.currency,
    stripeProductId: row.stripe_product_id || null,
    stripePriceId: row.stripe_price_id || null,
    billingType: row.billing_type || "one_time",
    accessModel: row.access_model || "coached_one_time",
    status: row.status,
    eventDate: row.event_date || null,
    eventName: row.event_name || null,
    eventLocation: row.event_location || null,
    eventDescription: row.event_description || null,
    calendarVisible: row.calendar_visible !== false,
    calendarHighlightRank: Number.isInteger(row.calendar_highlight_rank) ? row.calendar_highlight_rank : null,
    presetSelection: row.preset_selection || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    if (method === "GET") {
      const qs = event.queryStringParameters || {};

      if (qs.action === "sync-stripe") {
        const stripe = getStripeClient(config);
        const rows = await listTrainingPrograms(config);
        const programs = Array.isArray(rows) ? rows : [];
        const results = [];
        for (const p of programs) {
          if (!p.stripe_product_id && !p.stripe_price_id) {
            results.push({ id: p.id, name: p.name, sync: "no_stripe" });
            continue;
          }
          const status = await syncStripeStatus({ productId: p.stripe_product_id, priceId: p.stripe_price_id });
          const synced = status.productActive && status.priceActive;
          const warning = p.status === "active" && !synced;
          results.push({
            id: p.id,
            name: p.name,
            programStatus: p.status,
            sync: synced ? "synced" : "out_of_sync",
            warning,
            stripe: status
          });
        }
        return json(200, { syncResults: results });
      }

      if (qs.action === "normalize-external-ids") {
        const rows = await listTrainingPrograms(config);
        const programs = Array.isArray(rows) ? rows : [];
        const workingSet = programs.map((program) => ({ ...program }));
        const originalById = new Map(programs.map((program) => [program.id, program]));
        const updates = [];

        for (const program of workingSet) {
          const source = normalizeExternalSource(program.external_source);
          const generatedExternalId = reserveUniqueExternalId({
            existingPrograms: workingSet,
            externalSource: source,
            preferredExternalId: null,
            baseName: program.name,
            eventName: program.event_name,
            eventDate: program.event_date,
            durationWeeks: program.duration_weeks,
            currentProgramId: program.id
          });

          program.external_source = source;
          program.external_id = generatedExternalId;

          const original = originalById.get(program.id);
          const sourceChanged = source !== normalizeExternalSource(original ? original.external_source : null);
          const idChanged = generatedExternalId !== (original ? (original.external_id || null) : null);
          if (!sourceChanged && !idChanged) continue;

          const updated = await updateTrainingProgram(config, program.id, {
            external_source: source,
            external_id: generatedExternalId
          });
          if (updated) updates.push(mapProgram(updated));
        }

        return json(200, { normalized: updates.length, programs: updates });
      }

      const rows = await listTrainingPrograms(config);
      return json(200, { programs: Array.isArray(rows) ? rows.map(mapProgram) : [] });
    }

    if (method === "POST") {
      const payload = parseJsonBody(event);
      let normalized = normalizeProgramPayload(payload);

      const programs = await listTrainingPrograms(config);
      normalized.external_id = reserveUniqueExternalId({
        existingPrograms: programs,
        externalSource: normalized.external_source,
        preferredExternalId: normalized.external_id,
        baseName: normalized.name,
        eventName: normalized.event_name,
        eventDate: normalized.event_date,
        durationWeeks: normalized.duration_weeks,
        currentProgramId: null
      });

      if (payload.createStripeProductAndPrice) {
        if (!normalized.name || !normalized.price_cents || !normalized.currency) {
          return json(400, { error: "Nome, preço e moeda são obrigatórios para criar produto Stripe" });
        }
        try {
          getStripeClient(config);
          const recurring = normalized.billing_type === "recurring";
          const { productId, priceId } = await createStripeProductAndPrice({
            name: normalized.name,
            description: normalized.description,
            priceCents: normalized.price_cents,
            currency: normalized.currency,
            recurring
          });
          normalized.stripe_product_id = productId;
          normalized.stripe_price_id = priceId;
        } catch (err) {
          return json(500, { error: "Erro ao criar produto/preço no Stripe: " + (err.message || err) });
        }
      }

      const created = await createTrainingProgram(config, normalized);
      return json(201, { program: mapProgram(created) });
    }

    if (method === "PATCH") {
      const id = event.path.split("/").pop();
      if (!id) return json(400, { error: "Missing program id in path" });

      const patch = parseJsonBody(event);
      const dbPatch = { ...patch };

      if (dbPatch.name !== undefined) {
        const value = String(dbPatch.name || "").trim();
        if (!value) return json(400, { error: "name is required" });
        dbPatch.name = value;
      }
      if (dbPatch.externalSource !== undefined) {
        dbPatch.external_source = normalizeExternalSource(dbPatch.externalSource);
        delete dbPatch.externalSource;
      }
      if (dbPatch.externalId !== undefined) {
        dbPatch.external_id = dbPatch.externalId == null ? null : String(dbPatch.externalId).trim() || null;
        delete dbPatch.externalId;
      }
      if (dbPatch.description !== undefined) {
        dbPatch.description = dbPatch.description == null ? null : String(dbPatch.description);
      }
      if (dbPatch.imageUrl !== undefined) {
        dbPatch.image_url = dbPatch.imageUrl == null ? null : String(dbPatch.imageUrl).trim() || null;
        delete dbPatch.imageUrl;
      }
      if (dbPatch.durationWeeks !== undefined) {
        const value = Number(dbPatch.durationWeeks);
        if (!Number.isInteger(value) || value <= 0) {
          return json(400, { error: "durationWeeks must be a positive integer" });
        }
        dbPatch.duration_weeks = value;
        delete dbPatch.durationWeeks;
      }
      if (dbPatch.priceCents !== undefined) {
        const value = Number(dbPatch.priceCents);
        if (!Number.isInteger(value) || value < 0) {
          return json(400, { error: "priceCents must be a non-negative integer" });
        }
        dbPatch.price_cents = value;
        delete dbPatch.priceCents;
      }
      if (dbPatch.currency !== undefined) {
        dbPatch.currency = String(dbPatch.currency || "EUR").trim().toUpperCase() || "EUR";
      }
      if (dbPatch.stripeProductId !== undefined) {
        dbPatch.stripe_product_id = dbPatch.stripeProductId == null ? null : String(dbPatch.stripeProductId).trim() || null;
        delete dbPatch.stripeProductId;
      }
      if (dbPatch.stripePriceId !== undefined) {
        dbPatch.stripe_price_id = dbPatch.stripePriceId == null ? null : String(dbPatch.stripePriceId).trim() || null;
        delete dbPatch.stripePriceId;
      }
      if (dbPatch.billingType !== undefined) {
        const value = String(dbPatch.billingType || "one_time").trim().toLowerCase() || "one_time";
        if (!["one_time", "recurring"].includes(value)) {
          return json(400, { error: "billingType must be one_time or recurring" });
        }
        dbPatch.billing_type = value;
        delete dbPatch.billingType;
      }
      if (dbPatch.status !== undefined) {
        const value = String(dbPatch.status || "draft").trim().toLowerCase();
        if (!["draft", "active", "archived"].includes(value)) {
          return json(400, { error: "Invalid status value" });
        }
        dbPatch.status = value;
      }
      if (dbPatch.accessModel !== undefined) {
        const value = String(dbPatch.accessModel || "coached_one_time").trim().toLowerCase() || "coached_one_time";
        if (!["self_serve", "coached_one_time", "coached_recurring"].includes(value)) {
          return json(400, { error: "Invalid accessModel value" });
        }
        dbPatch.access_model = value;
        delete dbPatch.accessModel;
      }
      if (dbPatch.eventDate !== undefined) {
        const value = dbPatch.eventDate == null ? null : String(dbPatch.eventDate).trim();
        if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return json(400, { error: "eventDate must be in YYYY-MM-DD format" });
        }
        dbPatch.event_date = value || null;
        delete dbPatch.eventDate;
      }
      if (dbPatch.eventName !== undefined) {
        dbPatch.event_name = dbPatch.eventName == null ? null : String(dbPatch.eventName).trim() || null;
        delete dbPatch.eventName;
      }
      if (dbPatch.eventLocation !== undefined) {
        dbPatch.event_location = dbPatch.eventLocation == null ? null : String(dbPatch.eventLocation).trim() || null;
        delete dbPatch.eventLocation;
      }
      if (dbPatch.eventDescription !== undefined) {
        dbPatch.event_description = dbPatch.eventDescription == null ? null : String(dbPatch.eventDescription).trim() || null;
        delete dbPatch.eventDescription;
      }
      if (dbPatch.calendarVisible !== undefined) {
        dbPatch.calendar_visible = typeof dbPatch.calendarVisible === "boolean"
          ? dbPatch.calendarVisible
          : dbPatch.calendarVisible !== "false";
        delete dbPatch.calendarVisible;
      }
      if (dbPatch.calendarHighlightRank !== undefined) {
        if (dbPatch.calendarHighlightRank == null || dbPatch.calendarHighlightRank === "") {
          dbPatch.calendar_highlight_rank = null;
        } else {
          const rank = Number(dbPatch.calendarHighlightRank);
          if (!Number.isInteger(rank) || rank < 0) {
            return json(400, { error: "calendarHighlightRank must be a non-negative integer" });
          }
          dbPatch.calendar_highlight_rank = rank;
        }
        delete dbPatch.calendarHighlightRank;
      }
      if (dbPatch.presetSelection !== undefined) {
        const value = dbPatch.presetSelection == null ? null : String(dbPatch.presetSelection).trim().toLowerCase();
        if (value && !["coach", "athlete"].includes(value)) {
          return json(400, { error: "presetSelection must be coach or athlete" });
        }
        dbPatch.preset_selection = value || "athlete";
        delete dbPatch.presetSelection;
      }
      if (dbPatch.access_model === "coached_recurring" && dbPatch.billing_type && dbPatch.billing_type !== "recurring") {
        return json(400, { error: "accessModel coached_recurring requires billingType recurring" });
      }

      if (dbPatch.external_source !== undefined || dbPatch.external_id !== undefined) {
        const programs = await listTrainingPrograms(config);
        const current = Array.isArray(programs)
          ? programs.find((program) => program && program.id === id) || null
          : null;
        if (!current) return json(404, { error: "Program not found" });

        const resolvedSource = dbPatch.external_source !== undefined ? dbPatch.external_source : current.external_source;
        const resolvedName = dbPatch.name !== undefined ? dbPatch.name : current.name;
        const resolvedEventName = dbPatch.event_name !== undefined ? dbPatch.event_name : current.event_name;
        const resolvedEventDate = dbPatch.event_date !== undefined ? dbPatch.event_date : current.event_date;
        const resolvedDurationWeeks = dbPatch.duration_weeks !== undefined ? dbPatch.duration_weeks : current.duration_weeks;

        dbPatch.external_source = normalizeExternalSource(resolvedSource);
        dbPatch.external_id = reserveUniqueExternalId({
          existingPrograms: programs,
          externalSource: dbPatch.external_source,
          preferredExternalId: dbPatch.external_id,
          baseName: resolvedName,
          eventName: resolvedEventName,
          eventDate: resolvedEventDate,
          durationWeeks: resolvedDurationWeeks,
          currentProgramId: id
        });
      }

      const updated = await updateTrainingProgram(config, id, dbPatch);
      if (!updated) return json(404, { error: "Program not found" });
      return json(200, { program: mapProgram(updated) });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao gerir programas" });
  }
};
