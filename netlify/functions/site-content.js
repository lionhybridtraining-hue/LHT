const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const {
  listSiteMetadata,
  listSiteMetrics,
  listSiteReviews,
  listSiteLinks,
  listSiteFaqs,
  listPublicTrainingPrograms
} = require("./_lib/supabase");

function normalizeText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function formatPriceLabel(priceCents, currency) {
  if (!Number.isFinite(Number(priceCents))) return "";
  const amount = Number(priceCents) / 100;
  const isoCurrency = normalizeText(currency) || "EUR";
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: isoCurrency
    }).format(amount);
  } catch (_err) {
    return `${amount.toFixed(2)} ${isoCurrency.toUpperCase()}`;
  }
}

function deriveFeatureItems(featured) {
  const items = [];
  const relatedEvent = featured && featured.event && typeof featured.event === "object" ? featured.event : null;
  const eventName = normalizeText(relatedEvent && relatedEvent.name);
  const durationWeeks = featured && Number.isFinite(Number(featured.duration_weeks))
    ? Number(featured.duration_weeks)
    : null;
  const billingType = normalizeText(featured && featured.billing_type).toLowerCase();
  const paymentModel = normalizeText(featured && featured.payment_model).toLowerCase();
  const isRecurring = paymentModel === "recurring" || billingType === "recurring";

  if (eventName) items.push(`Evento associado: ${eventName}.`);
  if (!isRecurring && durationWeeks && durationWeeks > 0) items.push(`Plano com ${durationWeeks} semanas.`);

  return items.slice(0, 3);
}

function deriveFeaturedProgram(programs) {
  if (!Array.isArray(programs) || programs.length === 0) return null;

  const manuallyHighlighted = programs
    .filter((program) => program && program.highlighted === true)
    .sort((a, b) => {
      const createdA = Date.parse(a && a.created_at ? a.created_at : "") || 0;
      const createdB = Date.parse(b && b.created_at ? b.created_at : "") || 0;
      return createdA - createdB;
    });

  if (manuallyHighlighted.length) {
    const featured = manuallyHighlighted[0];
    const relatedEvent = featured && featured.event && typeof featured.event === "object" ? featured.event : null;
    const billingType = featured && featured.billing_type ? String(featured.billing_type) : "one_time";
    const accessModel = featured && featured.access_model ? String(featured.access_model) : "coached_one_time";
    const paymentModel = featured && featured.payment_model ? String(featured.payment_model) : (billingType === "recurring" ? "recurring" : "single");
    const priceCents = featured && featured.price_cents != null ? Number(featured.price_cents) : null;
    const currency = featured && featured.currency ? String(featured.currency) : "EUR";
    const startDate = featured && featured.start_date ? String(featured.start_date) : null;
    const hasScheduledStart = Boolean(startDate);

    const followupLabel = accessModel === "coached_recurring"
      ? "Acompanhamento individualizado"
      : accessModel === "coached_one_time"
        ? "Acompanhamento em grupo"
        : "";
    const paymentLabel = paymentModel === "phased"
      ? "Pagamento faseado"
      : billingType === "recurring" ? "Subscrição" : "Pagamento único";
    const availabilityLabel = hasScheduledStart ? "Acesso calendarizado" : "Acesso imediato";

    return {
      id: featured && featured.id ? String(featured.id) : null,
      name: featured && featured.name ? String(featured.name) : null,
      description: normalizeText(featured && (featured.commercial_description || featured.description)) || null,
      imageUrl: normalizeText(featured && featured.image_url) || null,
      durationWeeks: featured && featured.duration_weeks != null ? Number(featured.duration_weeks) : null,
      priceCents,
      currency,
      priceLabel: formatPriceLabel(priceCents, currency),
      billingType,
      tagline: paymentLabel,
      subtitle: normalizeText(featured && (featured.commercial_description || featured.description)) || null,
      followupLabel,
      paymentLabel,
      availabilityLabel,
      accessModel,
      paymentModel,
      startDate,
      immediateAccess: !hasScheduledStart,
      eventDate: relatedEvent && relatedEvent.event_date ? String(relatedEvent.event_date) : null,
      eventName: relatedEvent && relatedEvent.name ? String(relatedEvent.name) : null,
      eventLocation: relatedEvent && relatedEvent.event_location ? String(relatedEvent.event_location) : null,
      eventDescription: relatedEvent && relatedEvent.event_description ? String(relatedEvent.event_description) : null,
      features: deriveFeatureItems(featured),
      calendarHighlightRank: relatedEvent && relatedEvent.calendar_highlight_rank != null
        ? Number(relatedEvent.calendar_highlight_rank)
        : null,
      ctaUrl: featured && featured.id ? "/programas?program_id=" + encodeURIComponent(String(featured.id)) : null
    };
  }

  const highlighted = programs
    .filter((program) => {
      const rank = program && program.event && program.event.calendar_highlight_rank;
      return rank !== null && rank !== undefined && Number.isFinite(Number(rank));
    })
    .sort((a, b) => {
      const rankA = Number(a && a.event ? a.event.calendar_highlight_rank : null);
      const rankB = Number(b && b.event ? b.event.calendar_highlight_rank : null);
      if (rankA !== rankB) return rankA - rankB;

      const priceA = Number(a && a.price_cents != null ? a.price_cents : Number.MAX_SAFE_INTEGER);
      const priceB = Number(b && b.price_cents != null ? b.price_cents : Number.MAX_SAFE_INTEGER);
      if (priceA !== priceB) return priceA - priceB;

      const createdA = Date.parse(a && a.created_at ? a.created_at : "") || 0;
      const createdB = Date.parse(b && b.created_at ? b.created_at : "") || 0;
      return createdA - createdB;
    });

  const featured = highlighted[0] || programs[0];
  const relatedEvent = featured && featured.event && typeof featured.event === "object" ? featured.event : null;
  const billingType = featured && featured.billing_type ? String(featured.billing_type) : "one_time";
  const accessModel = featured && featured.access_model ? String(featured.access_model) : "coached_one_time";
  const paymentModel = featured && featured.payment_model ? String(featured.payment_model) : (billingType === "recurring" ? "recurring" : "single");
  const priceCents = featured && featured.price_cents != null ? Number(featured.price_cents) : null;
  const currency = featured && featured.currency ? String(featured.currency) : "EUR";
  const startDate = featured && featured.start_date ? String(featured.start_date) : null;
  const hasScheduledStart = Boolean(startDate);

  // Labels desacopladas: cada uma derivada de um eixo isolado
  const followupLabel = accessModel === "coached_recurring"
    ? "Acompanhamento individualizado"
    : accessModel === "coached_one_time"
      ? "Acompanhamento em grupo"
      : "";
  const paymentLabel = paymentModel === "phased"
    ? "Pagamento faseado"
    : billingType === "recurring" ? "Subscrição" : "Pagamento único";
  const availabilityLabel = hasScheduledStart ? "Acesso calendarizado" : "Acesso imediato";

  return {
    id: featured && featured.id ? String(featured.id) : null,
    name: featured && featured.name ? String(featured.name) : null,
    description: normalizeText(featured && (featured.commercial_description || featured.description)) || null,
    imageUrl: normalizeText(featured && featured.image_url) || null,
    durationWeeks: featured && featured.duration_weeks != null ? Number(featured.duration_weeks) : null,
    priceCents,
    currency,
    priceLabel: formatPriceLabel(priceCents, currency),
    billingType,
    tagline: paymentLabel,
    subtitle: normalizeText(featured && (featured.commercial_description || featured.description)) || null,
    followupLabel,
    paymentLabel,
    availabilityLabel,
    accessModel,
    paymentModel,
    startDate,
    immediateAccess: !hasScheduledStart,
    eventDate: relatedEvent && relatedEvent.event_date ? String(relatedEvent.event_date) : null,
    eventName: relatedEvent && relatedEvent.name ? String(relatedEvent.name) : null,
    eventLocation: relatedEvent && relatedEvent.event_location ? String(relatedEvent.event_location) : null,
    eventDescription: relatedEvent && relatedEvent.event_description ? String(relatedEvent.event_description) : null,
    features: deriveFeatureItems(featured),
    calendarHighlightRank: relatedEvent && relatedEvent.calendar_highlight_rank != null
      ? Number(relatedEvent.calendar_highlight_rank)
      : null,
    ctaUrl: featured && featured.id ? "/programas?program_id=" + encodeURIComponent(String(featured.id)) : null
  };
}

function mapMetadata(rows) {
  const metadata = {};
  (rows || []).forEach((row) => {
    const key = row && row.key ? String(row.key).trim() : "";
    if (!key) return;
    metadata[key] = row.value == null ? "" : String(row.value);
  });
  return metadata;
}

function mapMetrics(rows) {
  return (rows || [])
    .filter((row) => row && row.active !== false)
    .map((row) => ({
      value: row.value == null ? "" : String(row.value),
      label: row.label == null ? "" : String(row.label)
    }));
}

function mapReviews(rows) {
  return (rows || [])
    .filter((row) => row && row.active !== false)
    .map((row) => ({
      name: row.name ? String(row.name) : "Atleta LHT",
      stars: Math.max(1, Math.min(5, Number(row.stars || 5))),
      text: row.text == null ? "" : String(row.text),
      meta: row.meta ? String(row.meta) : "ATHLETIC ENDURANCE RUNNER",
      date: row.review_date || ""
    }));
}

function mapLinks(rows) {
  const links = {};
  (rows || []).forEach((row) => {
    const key = row && row.key ? String(row.key).trim() : "";
    if (!key) return;
    links[key] = row.url == null ? "" : String(row.url);
  });
  return links;
}

function mapFaqs(rows) {
  return (rows || [])
    .filter((row) => row && row.active !== false)
    .map((row) => ({
      question: row.question == null ? "" : String(row.question),
      answer: row.answer == null ? "" : String(row.answer)
    }));
}

function computeAggregateRating(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return { ratingValue: 4.9, reviewCount: 0 };
  }

  const sum = reviews.reduce((acc, item) => acc + Number(item.stars || 5), 0);
  const avg = Math.round((sum / reviews.length) * 10) / 10;
  return {
    ratingValue: avg,
    reviewCount: reviews.length
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();

    const [metadataRows, metricsRows, reviewsRows, linksRows, faqsRows, programsRows] = await Promise.all([
      listSiteMetadata(config),
      listSiteMetrics(config),
      listSiteReviews(config),
      listSiteLinks(config),
      listSiteFaqs(config),
      listPublicTrainingPrograms(config)
    ]);

    const metadata = mapMetadata(metadataRows);
    const metrics = mapMetrics(metricsRows);
    const reviews = mapReviews(reviewsRows);
    const links = mapLinks(linksRows);
    const faqs = mapFaqs(faqsRows);
    const featuredProgram = deriveFeaturedProgram(programsRows);

    return json(200, {
      metadata,
      metrics,
      reviews,
      links,
      faqs,
      featuredProgram,
      aggregateRating: computeAggregateRating(reviews)
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao carregar conteudo do site" });
  }
};
