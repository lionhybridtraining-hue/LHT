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

function deriveFeaturedProgram(programs) {
  if (!Array.isArray(programs) || programs.length === 0) return null;

  const highlighted = programs
    .filter((program) => {
      const rank = program && program.calendar_highlight_rank;
      return rank !== null && rank !== undefined && Number.isFinite(Number(rank));
    })
    .sort((a, b) => {
      const rankA = Number(a.calendar_highlight_rank);
      const rankB = Number(b.calendar_highlight_rank);
      if (rankA !== rankB) return rankA - rankB;

      const priceA = Number(a && a.price_cents != null ? a.price_cents : Number.MAX_SAFE_INTEGER);
      const priceB = Number(b && b.price_cents != null ? b.price_cents : Number.MAX_SAFE_INTEGER);
      if (priceA !== priceB) return priceA - priceB;

      const createdA = Date.parse(a && a.created_at ? a.created_at : "") || 0;
      const createdB = Date.parse(b && b.created_at ? b.created_at : "") || 0;
      return createdA - createdB;
    });

  const featured = highlighted[0] || programs[0];

  return {
    id: featured && featured.id ? String(featured.id) : null,
    name: featured && featured.name ? String(featured.name) : null,
    description: featured && featured.description ? String(featured.description) : null,
    durationWeeks: featured && featured.duration_weeks != null ? Number(featured.duration_weeks) : null,
    priceCents: featured && featured.price_cents != null ? Number(featured.price_cents) : null,
    currency: featured && featured.currency ? String(featured.currency) : "EUR",
    eventDate: featured && featured.event_date ? String(featured.event_date) : null,
    eventName: featured && featured.event_name ? String(featured.event_name) : null,
    eventLocation: featured && featured.event_location ? String(featured.event_location) : null,
    eventDescription: featured && featured.event_description ? String(featured.event_description) : null,
    calendarHighlightRank:
      featured && featured.calendar_highlight_rank != null
        ? Number(featured.calendar_highlight_rank)
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
