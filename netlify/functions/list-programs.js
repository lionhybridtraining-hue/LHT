const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { listPublicTrainingPrograms } = require("./_lib/supabase");

const HTML_ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " "
};

function decodeHtmlEntities(value) {
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, token) => {
    const normalized = String(token || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(HTML_ENTITY_MAP, normalized)) {
      return HTML_ENTITY_MAP[normalized];
    }
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return match;
  });
}

function toPlainTextSummary(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const stripped = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|blockquote|section|article)>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const decoded = decodeHtmlEntities(stripped)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return decoded || null;
}

function toCommercialSummary(value, fallbackValue) {
  const normalized = toPlainTextSummary(value) || toPlainTextSummary(fallbackValue);
  if (!normalized) return null;

  const sentenceMatch = normalized.match(/^(.{1,180}?[.!?](?:\s|$))/);
  if (sentenceMatch && sentenceMatch[1]) {
    return sentenceMatch[1].trim();
  }

  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177).trimEnd()}...`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const mode = String((event.queryStringParameters || {}).mode || "").trim().toLowerCase();
    const rows = await listPublicTrainingPrograms(config);
    const todayIso = new Date().toISOString().slice(0, 10);
    const mappedPrograms = Array.isArray(rows)
      ? rows.map((program) => {
          const event = program && program.event && typeof program.event === "object" ? program.event : null;
          const eventId = event && event.id ? String(event.id) : (program.event_id || null);
          const eventName = event && event.name ? String(event.name) : null;
          const eventDate = event && event.event_date ? String(event.event_date) : null;
          const eventLocation = event && event.event_location ? String(event.event_location) : null;
          const eventDescription = event && event.event_description ? String(event.event_description) : null;
          const calendarVisible = event ? event.calendar_visible !== false : false;
          const calendarHighlightRank = Number.isInteger(event && event.calendar_highlight_rank)
            ? event.calendar_highlight_rank
            : null;
          const startDate = program && program.start_date ? String(program.start_date) : null;
          const prices = {
            monthly: program && program.recurring_price_monthly_cents != null
              ? Number(program.recurring_price_monthly_cents)
              : ((program && program.billing_type === "recurring" && program.price_cents != null)
                ? Number(program.price_cents)
                : null),
            quarterly: program && program.recurring_price_quarterly_cents != null
              ? Number(program.recurring_price_quarterly_cents)
              : null,
            annual: program && program.recurring_price_annual_cents != null
              ? Number(program.recurring_price_annual_cents)
              : null
          };

          return {
            id: program.id,
            externalId: program.external_id || null,
            name: program.name,
            commercialDescription: toCommercialSummary(program.commercial_description, program.description),
            technicalDescription: String(program.technical_description || program.description || "").trim() || null,
            description: toPlainTextSummary(program.description),
            imageUrl: program.image_url || null,
            durationWeeks: program.duration_weeks,
            priceCents: program.price_cents,
            currency: program.currency,
            billingType: program.billing_type || "one_time",
            accessModel: program.access_model || "coached_one_time",
            paymentModel: program.payment_model || (program.billing_type === "recurring" ? "recurring" : "single"),
            prices,
            startDate,
            immediateAccess: !startDate,
            eventId,
            eventDate,
            eventName,
            eventLocation,
            eventDescription: toPlainTextSummary(eventDescription),
            calendarVisible,
            calendarHighlightRank
          };
        })
      : [];

    if (mode === "calendar") {
      const challenges = mappedPrograms
        .filter((program) => program.calendarVisible && program.eventDate && program.eventDate >= todayIso)
        .sort((a, b) => {
          const ar = a.calendarHighlightRank;
          const br = b.calendarHighlightRank;
          if (ar != null && br != null && ar !== br) return ar - br;
          if (ar != null && br == null) return -1;
          if (ar == null && br != null) return 1;
          if (a.eventDate !== b.eventDate) return a.eventDate.localeCompare(b.eventDate);
          return String(a.name || "").localeCompare(String(b.name || ""));
        });
      return json(200, { ok: true, mode: "calendar", challenges });
    }

    return json(200, {
      ok: true,
      programs: mappedPrograms
    });
  } catch (error) {
    return json(500, { error: error.message || "Nao foi possivel listar programas" });
  }
};