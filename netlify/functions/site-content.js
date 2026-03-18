const { json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const {
  listSiteMetadata,
  listSiteMetrics,
  listSiteReviews,
  listSiteLinks
} = require("./_lib/supabase");

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

    const [metadataRows, metricsRows, reviewsRows, linksRows] = await Promise.all([
      listSiteMetadata(config),
      listSiteMetrics(config),
      listSiteReviews(config),
      listSiteLinks(config)
    ]);

    const metadata = mapMetadata(metadataRows);
    const metrics = mapMetrics(metricsRows);
    const reviews = mapReviews(reviewsRows);
    const links = mapLinks(linksRows);

    return json(200, {
      metadata,
      metrics,
      reviews,
      links,
      aggregateRating: computeAggregateRating(reviews)
    });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao carregar conteudo do site" });
  }
};
