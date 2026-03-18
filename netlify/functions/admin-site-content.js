const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  listSiteMetadata,
  listSiteMetrics,
  listSiteReviews,
  listSiteLinks,
  replaceSiteMetadata,
  replaceSiteMetrics,
  replaceSiteReviews,
  replaceSiteLinks
} = require("./_lib/supabase");

class ValidationError extends Error {}

function normalizeBoolean(value, fallback = true) {
  if (value == null) return fallback;
  return Boolean(value);
}

function normalizeKeyValueArray(input, { valueField }) {
  if (input == null) return [];

  if (Array.isArray(input)) {
    return input
      .map((item) => {
        const key = item && item.key != null ? String(item.key).trim() : "";
        const value = item && item[valueField] != null ? String(item[valueField]) : "";
        if (!key) return null;
        return valueField === "value" ? { key, value } : { key, url: value };
      })
      .filter(Boolean);
  }

  if (typeof input === "object") {
    return Object.entries(input)
      .map(([rawKey, rawValue]) => {
        const key = String(rawKey || "").trim();
        if (!key) return null;
        const value = rawValue == null ? "" : String(rawValue);
        return valueField === "value" ? { key, value } : { key, url: value };
      })
      .filter(Boolean);
  }

  throw new ValidationError("metadata/links must be an object or array");
}

function normalizeMetrics(input) {
  if (!Array.isArray(input)) {
    throw new ValidationError("metrics must be an array");
  }

  return input.map((item, index) => {
    const value = item && item.value != null ? String(item.value) : "";
    const label = item && item.label != null ? String(item.label) : "";
    const sortOrder = Number(item && item.sortOrder != null ? item.sortOrder : index);

    if (!Number.isInteger(sortOrder)) {
      throw new ValidationError("metrics.sortOrder must be an integer");
    }

    return {
      sort_order: sortOrder,
      value,
      label,
      active: normalizeBoolean(item && item.active, true)
    };
  });
}

function normalizeReviewDate(rawDate) {
  if (rawDate == null || String(rawDate).trim() === "") return null;
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("reviews.date must be a valid date");
  }
  return parsed.toISOString().slice(0, 10);
}

function normalizeReviews(input) {
  if (!Array.isArray(input)) {
    throw new ValidationError("reviews must be an array");
  }

  return input.map((item, index) => {
    const stars = Number(item && item.stars != null ? item.stars : 5);
    const sortOrder = Number(item && item.sortOrder != null ? item.sortOrder : index);

    if (!Number.isInteger(sortOrder)) {
      throw new ValidationError("reviews.sortOrder must be an integer");
    }

    if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
      throw new ValidationError("reviews.stars must be between 1 and 5");
    }

    return {
      sort_order: sortOrder,
      name: item && item.name ? String(item.name).trim() : "Atleta LHT",
      stars: Math.round(stars),
      text: item && item.text != null ? String(item.text) : "",
      meta: item && item.meta ? String(item.meta).trim() : "ATHLETIC ENDURANCE RUNNER",
      review_date: normalizeReviewDate(item && (item.date || item.reviewDate || item.review_date)),
      active: normalizeBoolean(item && item.active, true)
    };
  });
}

function mapAdminPayload({ metadataRows, metricsRows, reviewsRows, linksRows }) {
  return {
    metadata: (metadataRows || []).map((row) => ({
      key: row.key,
      value: row.value == null ? "" : String(row.value)
    })),
    metrics: (metricsRows || []).map((row) => ({
      id: row.id,
      sortOrder: row.sort_order,
      value: row.value == null ? "" : String(row.value),
      label: row.label == null ? "" : String(row.label),
      active: row.active !== false
    })),
    reviews: (reviewsRows || []).map((row) => ({
      id: row.id,
      sortOrder: row.sort_order,
      name: row.name == null ? "Atleta LHT" : String(row.name),
      stars: Number(row.stars || 5),
      text: row.text == null ? "" : String(row.text),
      meta: row.meta == null ? "ATHLETIC ENDURANCE RUNNER" : String(row.meta),
      date: row.review_date || "",
      active: row.active !== false
    })),
    links: (linksRows || []).map((row) => ({
      key: row.key,
      url: row.url == null ? "" : String(row.url)
    }))
  };
}

async function readAll(config) {
  const [metadataRows, metricsRows, reviewsRows, linksRows] = await Promise.all([
    listSiteMetadata(config),
    listSiteMetrics(config),
    listSiteReviews(config),
    listSiteLinks(config)
  ]);

  return { metadataRows, metricsRows, reviewsRows, linksRows };
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (!["GET", "PUT"].includes(method)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    if (method === "GET") {
      const rows = await readAll(config);
      return json(200, mapAdminPayload(rows));
    }

    const payload = parseJsonBody(event);
    const metadata = normalizeKeyValueArray(payload.metadata, { valueField: "value" });
    const links = normalizeKeyValueArray(payload.links, { valueField: "url" });
    const metrics = normalizeMetrics(payload.metrics || []);
    const reviews = normalizeReviews(payload.reviews || []);

    await Promise.all([
      replaceSiteMetadata(config, metadata),
      replaceSiteMetrics(config, metrics),
      replaceSiteReviews(config, reviews),
      replaceSiteLinks(config, links)
    ]);

    const rows = await readAll(config);
    return json(200, mapAdminPayload(rows));
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { error: err.message });
    }
    return json(500, { error: err.message || "Erro ao gerir conteudo do site" });
  }
};
