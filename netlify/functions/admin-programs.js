const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  listTrainingPrograms,
  createTrainingProgram,
  updateTrainingProgram,
  getTrainingEventById
} = require("./_lib/supabase");
const { createStripeProductAndPrice, createPriceForProduct, getStripeClient, syncStripeStatus } = require("./_lib/stripe");

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

function parseIsoDate(value, fieldName) {
  if (value == null || value === "") return null;
  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format`);
  }
  return normalized;
}

function normalizeOptionalCents(value, fieldName) {
  if (value == null || value === "") return null;
  const cents = Number(value);
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return cents;
}

function calculateProgramStartDate(eventDate, durationWeeks) {
  const normalizedEventDate = parseIsoDate(eventDate, "eventDate");
  const weeks = Number(durationWeeks);
  if (!normalizedEventDate || !Number.isInteger(weeks) || weeks <= 0) return null;

  const date = new Date(`${normalizedEventDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (weeks * 7));
  return date.toISOString().slice(0, 10);
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
  const commercialDescriptionRaw = payload.commercialDescription == null
    ? payload.commercial_description
    : payload.commercialDescription;
  const technicalDescriptionRaw = payload.technicalDescription == null
    ? payload.technical_description
    : payload.technicalDescription;
  const legacyDescriptionRaw = payload.description;
  const commercialDescription = commercialDescriptionRaw == null ? null : commercialDescriptionRaw.toString().trim() || null;
  const technicalDescription = technicalDescriptionRaw == null ? null : technicalDescriptionRaw.toString().trim() || null;
  const description = technicalDescription || commercialDescription || (legacyDescriptionRaw == null ? null : legacyDescriptionRaw.toString().trim() || null);
  const imageUrlRaw = payload.imageUrl == null ? payload.image_url : payload.imageUrl;
  const imageUrl = imageUrlRaw == null ? null : imageUrlRaw.toString().trim() || null;
  const durationWeeks = Number(payload.durationWeeks);
  const priceCents = Number(payload.priceCents ?? 0);
  const recurringPriceMonthlyCents = normalizeOptionalCents(
    payload.recurringPriceMonthlyCents == null ? payload.recurring_price_monthly_cents : payload.recurringPriceMonthlyCents,
    "recurringPriceMonthlyCents"
  );
  const recurringPriceQuarterlyCents = normalizeOptionalCents(
    payload.recurringPriceQuarterlyCents == null ? payload.recurring_price_quarterly_cents : payload.recurringPriceQuarterlyCents,
    "recurringPriceQuarterlyCents"
  );
  const recurringPriceAnnualCents = normalizeOptionalCents(
    payload.recurringPriceAnnualCents == null ? payload.recurring_price_annual_cents : payload.recurringPriceAnnualCents,
    "recurringPriceAnnualCents"
  );
  const currency = (payload.currency || "EUR").toString().trim().toUpperCase() || "EUR";
  const stripeProductId = payload.stripeProductId == null ? null : payload.stripeProductId.toString().trim() || null;
  const stripePriceId = payload.stripePriceId == null ? null : payload.stripePriceId.toString().trim() || null;
  const stripePriceIdMonthly = payload.stripePriceIdMonthly == null
    ? (payload.stripe_price_id_monthly == null ? null : payload.stripe_price_id_monthly.toString().trim() || null)
    : payload.stripePriceIdMonthly.toString().trim() || null;
  const stripePriceIdQuarterly = payload.stripePriceIdQuarterly == null
    ? (payload.stripe_price_id_quarterly == null ? null : payload.stripe_price_id_quarterly.toString().trim() || null)
    : payload.stripePriceIdQuarterly.toString().trim() || null;
  const stripePriceIdAnnual = payload.stripePriceIdAnnual == null
    ? (payload.stripe_price_id_annual == null ? null : payload.stripe_price_id_annual.toString().trim() || null)
    : payload.stripePriceIdAnnual.toString().trim() || null;
  const billingType = (payload.billingType || "one_time").toString().trim().toLowerCase() || "one_time";
  const accessModel = (payload.accessModel || "coached_one_time").toString().trim().toLowerCase() || "coached_one_time";
  const paymentModelRaw = (payload.paymentModel || payload.payment_model || "").toString().trim().toLowerCase();
  const paymentModel = paymentModelRaw && ["single", "recurring", "phased"].includes(paymentModelRaw)
    ? paymentModelRaw
    : (billingType === "recurring" ? "recurring" : "single");
  const status = (payload.status || "draft").toString().trim().toLowerCase();
  const eventIdRaw = payload.eventId == null ? payload.event_id : payload.eventId;
  const eventId = eventIdRaw == null ? null : eventIdRaw.toString().trim() || null;
  const startDateRaw = payload.startDate == null ? payload.start_date : payload.startDate;
  const startDate = parseIsoDate(startDateRaw, "startDate");

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
  if (billingType === "recurring" && recurringPriceMonthlyCents == null) {
    throw new Error("recurringPriceMonthlyCents is required when billingType is recurring");
  }
  if (paymentModel === "recurring" && billingType !== "recurring") {
    throw new Error("paymentModel recurring requires billingType recurring");
  }
  if (paymentModel === "phased" && billingType === "recurring") {
    throw new Error("paymentModel phased is not compatible with billingType recurring");
  }
  if (!["draft", "active", "archived"].includes(status)) throw new Error("status must be draft, active or archived");

  const presetSelectionRaw = (payload.presetSelection || payload.preset_selection || "").toString().trim().toLowerCase();
  const presetSelection = presetSelectionRaw && ["coach", "athlete"].includes(presetSelectionRaw)
    ? presetSelectionRaw
    : "athlete";

  return {
    name,
    external_source: externalSource,
    external_id: externalId,
    commercial_description: commercialDescription,
    technical_description: technicalDescription,
    description,
    image_url: imageUrl,
    duration_weeks: durationWeeks,
    price_cents: priceCents,
    recurring_price_monthly_cents: recurringPriceMonthlyCents,
    recurring_price_quarterly_cents: recurringPriceQuarterlyCents,
    recurring_price_annual_cents: recurringPriceAnnualCents,
    currency,
    stripe_product_id: stripeProductId,
    stripe_price_id: stripePriceId,
    stripe_price_id_monthly: stripePriceIdMonthly,
    stripe_price_id_quarterly: stripePriceIdQuarterly,
    stripe_price_id_annual: stripePriceIdAnnual,
    billing_type: billingType,
    access_model: accessModel,
    payment_model: paymentModel,
    status,
    event_id: eventId,
    start_date: startDate,
    preset_selection: presetSelection
  };
}

function mapProgram(row) {
  return {
    id: row.id,
    name: row.name,
    externalSource: row.external_source,
    externalId: row.external_id,
    commercialDescription: row.commercial_description || null,
    technicalDescription: row.technical_description || null,
    description: row.description,
    imageUrl: row.image_url || null,
    durationWeeks: row.duration_weeks,
    priceCents: row.price_cents,
    recurringPriceMonthlyCents: row.recurring_price_monthly_cents == null ? null : row.recurring_price_monthly_cents,
    recurringPriceQuarterlyCents: row.recurring_price_quarterly_cents == null ? null : row.recurring_price_quarterly_cents,
    recurringPriceAnnualCents: row.recurring_price_annual_cents == null ? null : row.recurring_price_annual_cents,
    currency: row.currency,
    stripeProductId: row.stripe_product_id || null,
    stripePriceId: row.stripe_price_id || null,
    stripePriceIdMonthly: row.stripe_price_id_monthly || null,
    stripePriceIdQuarterly: row.stripe_price_id_quarterly || null,
    stripePriceIdAnnual: row.stripe_price_id_annual || null,
    billingType: row.billing_type || "one_time",
    accessModel: row.access_model || "coached_one_time",
    paymentModel: row.payment_model || (row.billing_type === "recurring" ? "recurring" : "single"),
    status: row.status,
    eventId: row.event_id || null,
    startDate: row.start_date || null,
    immediateAccess: !row.start_date,
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
          const hasAnyPriceId = Boolean(
            p.stripe_price_id
            || p.stripe_price_id_monthly
            || p.stripe_price_id_quarterly
            || p.stripe_price_id_annual
          );
          if (!p.stripe_product_id && !hasAnyPriceId) {
            results.push({ id: p.id, name: p.name, sync: "no_stripe" });
            continue;
          }
          const primaryPriceId = p.stripe_price_id
            || p.stripe_price_id_monthly
            || p.stripe_price_id_quarterly
            || p.stripe_price_id_annual
            || null;
          const status = await syncStripeStatus({ productId: p.stripe_product_id, priceId: primaryPriceId });
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
            eventName: program && program.event ? program.event.name : null,
            eventDate: program && program.event ? program.event.event_date : null,
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
      const recurringPricingSchemaReady = !(Array.isArray(rows) && rows.__legacyRecurringSchema === true);
      return json(200, {
        programs: Array.isArray(rows) ? rows.map(mapProgram) : [],
        recurringPricingSchemaReady
      });
    }

    if (method === "POST") {
      const payload = parseJsonBody(event);
      let normalized = normalizeProgramPayload(payload);
      let relatedEvent = null;

      if (normalized.event_id) {
        relatedEvent = await getTrainingEventById(config, normalized.event_id);
        if (!relatedEvent) {
          return json(400, { error: "eventId does not reference an existing event" });
        }
        normalized.start_date = calculateProgramStartDate(relatedEvent.event_date, normalized.duration_weeks);
      }

      if (normalized.billing_type === "recurring") {
        const monthlyCents = normalized.recurring_price_monthly_cents == null
          ? normalized.price_cents
          : normalized.recurring_price_monthly_cents;
        normalized.recurring_price_monthly_cents = monthlyCents;
        normalized.price_cents = monthlyCents;
      }

      const programs = await listTrainingPrograms(config);
      normalized.external_id = reserveUniqueExternalId({
        existingPrograms: programs,
        externalSource: normalized.external_source,
        preferredExternalId: normalized.external_id,
        baseName: normalized.name,
        eventName: relatedEvent ? relatedEvent.name : null,
        eventDate: relatedEvent ? relatedEvent.event_date : null,
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
            description: normalized.commercial_description || normalized.technical_description || normalized.description,
            priceCents: normalized.price_cents,
            currency: normalized.currency,
            recurring
          });
          normalized.stripe_product_id = productId;
          normalized.stripe_price_id = priceId;
          if (recurring) {
            normalized.stripe_price_id_monthly = priceId;

            if (normalized.recurring_price_quarterly_cents != null) {
              const quarterlyPrice = await createPriceForProduct({
                productId,
                priceCents: normalized.recurring_price_quarterly_cents,
                currency: normalized.currency,
                recurring: { interval: "month", intervalCount: 3 }
              });
              normalized.stripe_price_id_quarterly = quarterlyPrice && quarterlyPrice.id ? quarterlyPrice.id : null;
            }

            if (normalized.recurring_price_annual_cents != null) {
              const annualPrice = await createPriceForProduct({
                productId,
                priceCents: normalized.recurring_price_annual_cents,
                currency: normalized.currency,
                recurring: { interval: "year", intervalCount: 1 }
              });
              normalized.stripe_price_id_annual = annualPrice && annualPrice.id ? annualPrice.id : null;
            }
          }
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
      if (dbPatch.commercialDescription !== undefined) {
        dbPatch.commercial_description = dbPatch.commercialDescription == null
          ? null
          : String(dbPatch.commercialDescription).trim() || null;
        delete dbPatch.commercialDescription;
      }
      if (dbPatch.technicalDescription !== undefined) {
        dbPatch.technical_description = dbPatch.technicalDescription == null
          ? null
          : String(dbPatch.technicalDescription).trim() || null;
        delete dbPatch.technicalDescription;
      }
      if (dbPatch.commercial_description !== undefined && dbPatch.technical_description === undefined) {
        dbPatch.description = dbPatch.commercial_description;
      }
      if (dbPatch.technical_description !== undefined) {
        dbPatch.description = dbPatch.technical_description || dbPatch.commercial_description || null;
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
      if (dbPatch.recurringPriceMonthlyCents !== undefined) {
        try {
          dbPatch.recurring_price_monthly_cents = normalizeOptionalCents(dbPatch.recurringPriceMonthlyCents, "recurringPriceMonthlyCents");
        } catch (err) {
          return json(400, { error: err.message || "Invalid recurringPriceMonthlyCents" });
        }
        delete dbPatch.recurringPriceMonthlyCents;
      }
      if (dbPatch.recurringPriceQuarterlyCents !== undefined) {
        try {
          dbPatch.recurring_price_quarterly_cents = normalizeOptionalCents(dbPatch.recurringPriceQuarterlyCents, "recurringPriceQuarterlyCents");
        } catch (err) {
          return json(400, { error: err.message || "Invalid recurringPriceQuarterlyCents" });
        }
        delete dbPatch.recurringPriceQuarterlyCents;
      }
      if (dbPatch.recurringPriceAnnualCents !== undefined) {
        try {
          dbPatch.recurring_price_annual_cents = normalizeOptionalCents(dbPatch.recurringPriceAnnualCents, "recurringPriceAnnualCents");
        } catch (err) {
          return json(400, { error: err.message || "Invalid recurringPriceAnnualCents" });
        }
        delete dbPatch.recurringPriceAnnualCents;
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
      if (dbPatch.stripePriceIdMonthly !== undefined) {
        dbPatch.stripe_price_id_monthly = dbPatch.stripePriceIdMonthly == null ? null : String(dbPatch.stripePriceIdMonthly).trim() || null;
        delete dbPatch.stripePriceIdMonthly;
      }
      if (dbPatch.stripePriceIdQuarterly !== undefined) {
        dbPatch.stripe_price_id_quarterly = dbPatch.stripePriceIdQuarterly == null ? null : String(dbPatch.stripePriceIdQuarterly).trim() || null;
        delete dbPatch.stripePriceIdQuarterly;
      }
      if (dbPatch.stripePriceIdAnnual !== undefined) {
        dbPatch.stripe_price_id_annual = dbPatch.stripePriceIdAnnual == null ? null : String(dbPatch.stripePriceIdAnnual).trim() || null;
        delete dbPatch.stripePriceIdAnnual;
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
      if (dbPatch.paymentModel !== undefined) {
        const value = String(dbPatch.paymentModel || "").trim().toLowerCase();
        if (value && !["single", "recurring", "phased"].includes(value)) {
          return json(400, { error: "paymentModel must be single, recurring or phased" });
        }
        dbPatch.payment_model = value || null;
        delete dbPatch.paymentModel;
      }
      if (dbPatch.eventId !== undefined) {
        dbPatch.event_id = dbPatch.eventId == null ? null : String(dbPatch.eventId).trim() || null;
        delete dbPatch.eventId;
      }
      if (dbPatch.event_id !== undefined) {
        dbPatch.event_id = dbPatch.event_id == null ? null : String(dbPatch.event_id).trim() || null;
      }
      if (dbPatch.startDate !== undefined) {
        dbPatch.start_date = parseIsoDate(dbPatch.startDate, "startDate");
        delete dbPatch.startDate;
      }
      if (dbPatch.start_date !== undefined) {
        dbPatch.start_date = parseIsoDate(dbPatch.start_date, "startDate");
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
      if (dbPatch.payment_model === "recurring" && dbPatch.billing_type && dbPatch.billing_type !== "recurring") {
        return json(400, { error: "paymentModel recurring requires billingType recurring" });
      }
      if (dbPatch.payment_model === "phased" && dbPatch.billing_type === "recurring") {
        return json(400, { error: "paymentModel phased is not compatible with billingType recurring" });
      }

      if (dbPatch.billing_type === "recurring") {
        const monthly = dbPatch.recurring_price_monthly_cents;
        if (monthly === undefined || monthly === null) {
          return json(400, { error: "recurringPriceMonthlyCents is required when billingType is recurring" });
        }
        dbPatch.price_cents = monthly;
      }
      if (dbPatch.recurring_price_monthly_cents !== undefined && dbPatch.recurring_price_monthly_cents !== null) {
        dbPatch.price_cents = dbPatch.recurring_price_monthly_cents;
      }

      let programs = null;
      const mustLoadPrograms = dbPatch.external_source !== undefined || dbPatch.external_id !== undefined;
      let current = null;
      const needsCurrentProgram = mustLoadPrograms
        || dbPatch.event_id !== undefined
        || dbPatch.duration_weeks !== undefined
        || dbPatch.start_date !== undefined;

      if (needsCurrentProgram) {
        programs = await listTrainingPrograms(config);
        current = Array.isArray(programs)
          ? programs.find((program) => program && program.id === id) || null
          : null;
        if (!current) return json(404, { error: "Program not found" });
      }

      if (dbPatch.external_source !== undefined || dbPatch.external_id !== undefined) {
        programs = programs || await listTrainingPrograms(config);
        current = current || (Array.isArray(programs)
          ? programs.find((program) => program && program.id === id) || null
          : null);
        if (!current) return json(404, { error: "Program not found" });

        const resolvedSource = dbPatch.external_source !== undefined ? dbPatch.external_source : current.external_source;
        const resolvedName = dbPatch.name !== undefined ? dbPatch.name : current.name;
        const resolvedDurationWeeks = dbPatch.duration_weeks !== undefined ? dbPatch.duration_weeks : current.duration_weeks;
        const resolvedEventId = dbPatch.event_id !== undefined ? dbPatch.event_id : current.event_id;
        let resolvedEvent = current && current.event_id === resolvedEventId ? current.event : null;
        if (resolvedEventId && !resolvedEvent) {
          resolvedEvent = await getTrainingEventById(config, resolvedEventId);
          if (!resolvedEvent) {
            return json(400, { error: "eventId does not reference an existing event" });
          }
        }

        dbPatch.external_source = normalizeExternalSource(resolvedSource);
        dbPatch.external_id = reserveUniqueExternalId({
          existingPrograms: programs,
          externalSource: dbPatch.external_source,
          preferredExternalId: dbPatch.external_id,
          baseName: resolvedName,
          eventName: resolvedEvent ? resolvedEvent.name : null,
          eventDate: resolvedEvent ? resolvedEvent.event_date : null,
          durationWeeks: resolvedDurationWeeks,
          currentProgramId: id
        });
      }

      if (needsCurrentProgram) {
        const resolvedDurationWeeks = dbPatch.duration_weeks !== undefined ? dbPatch.duration_weeks : current.duration_weeks;
        const resolvedEventId = dbPatch.event_id !== undefined ? dbPatch.event_id : current.event_id;
        if (resolvedEventId) {
          const resolvedEvent = current && current.event_id === resolvedEventId ? current.event : await getTrainingEventById(config, resolvedEventId);
          if (!resolvedEvent) {
            return json(400, { error: "eventId does not reference an existing event" });
          }
          dbPatch.start_date = calculateProgramStartDate(resolvedEvent.event_date, resolvedDurationWeeks);
        }
      }

      const updated = await updateTrainingProgram(config, id, dbPatch);
      if (!updated) return json(404, { error: "Program not found" });
      return json(200, { program: mapProgram(updated) });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const status = Number.isInteger(err && err.status) ? err.status : 500;
    return json(status, { error: err.message || "Erro ao gerir programas" });
  }
};
