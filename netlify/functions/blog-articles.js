const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const {
  listPublishedBlogArticles,
  getPublishedBlogArticleBySlug,
  listBlogArticlesAdmin,
  createBlogArticle,
  updateBlogArticle,
  softDeleteBlogArticle,
  getBlogArticleBySlugAny,
  archiveDeletedBlogArticleSlug
} = require("./_lib/supabase");
const { requireRole } = require("./_lib/authz");

class ValidationError extends Error {}

function isSlugConflictError(err) {
  const message = err && err.message ? String(err.message).toLowerCase() : "";
  return message.includes("blog_articles_slug") || message.includes("duplicate key value");
}

function normalizeStatus(rawStatus) {
  if (!rawStatus) return undefined;
  const status = String(rawStatus).trim().toLowerCase();
  if (status === "draft" || status === "published") return status;
  throw new ValidationError("status must be one of: draft, published");
}

function normalizePayload(payload, { isCreate = false } = {}) {
  const title = payload.title == null ? undefined : String(payload.title).trim();
  const slug = payload.slug == null ? undefined : String(payload.slug).trim();
  const content = payload.content == null ? undefined : String(payload.content);
  const excerpt = payload.excerpt == null ? undefined : String(payload.excerpt).trim();
  const category = payload.category == null ? "Artigo" : String(payload.category).trim() || "Artigo";
  const status = normalizeStatus(payload.status);
  const publishedAt = payload.publishedAt || payload.published_at || undefined;

  if (isCreate) {
    if (!title) throw new ValidationError("title is required");
    if (!content) throw new ValidationError("content is required");
  }

  const normalized = {};

  if (title !== undefined) normalized.title = title;
  if (slug !== undefined) normalized.slug = slug;
  if (content !== undefined) normalized.content = content;
  if (excerpt !== undefined) normalized.excerpt = excerpt || null;
  if (category !== undefined) normalized.category = category;
  if (status !== undefined) normalized.status = status;

  if (publishedAt !== undefined && publishedAt !== null && String(publishedAt).trim()) {
    const date = new Date(publishedAt);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError("publishedAt must be a valid date");
    }
    normalized.published_at = date.toISOString();
  }

  if (normalized.status === "published" && !normalized.published_at) {
    normalized.published_at = new Date().toISOString();
  }

  return normalized;
}

function mapArticle(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || "",
    category: row.category || "Artigo",
    content: row.content || "",
    status: row.status || "draft",
    publishedAt: row.published_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const query = event.queryStringParameters || {};

  try {
    const config = getConfig();

    if (method === "GET") {
      const isAdminMode = query.admin === "1";
      if (isAdminMode) {
        const auth = await requireRole(event, config, "admin");
        if (auth.error) return auth.error;
        const rows = await listBlogArticlesAdmin(config);
        return json(200, { articles: (rows || []).map(mapArticle) });
      }

      if (query.slug) {
        const article = await getPublishedBlogArticleBySlug(config, query.slug);
        if (!article) return json(404, { error: "Article not found" });
        return json(200, { article: mapArticle(article) });
      }

      const rows = await listPublishedBlogArticles(config);
      return json(200, { articles: (rows || []).map(mapArticle) });
    }

    if (["POST", "PATCH", "DELETE"].includes(method)) {
      const auth = await requireRole(event, config, "admin");
      if (auth.error) return auth.error;
    }

    if (method === "POST") {
      const payload = parseJsonBody(event);
      const normalized = normalizePayload(payload, { isCreate: true });
      let created;
      try {
        created = await createBlogArticle(config, normalized);
      } catch (err) {
        if (!isSlugConflictError(err) || !normalized.slug) {
          throw err;
        }

        const existing = await getBlogArticleBySlugAny(config, normalized.slug);
        const isDeleted = Boolean(existing && existing.deleted_at);
        if (!existing || !isDeleted) {
          throw err;
        }

        await archiveDeletedBlogArticleSlug(config, existing.id);
        created = await createBlogArticle(config, normalized);
      }
      return json(201, { article: mapArticle(created) });
    }

    if (method === "PATCH") {
      const payload = parseJsonBody(event);
      const id = payload.id ? String(payload.id).trim() : "";
      if (!id) return json(400, { error: "id is required" });

      const normalized = normalizePayload(payload, { isCreate: false });
      delete normalized.id;
      if (!Object.keys(normalized).length) {
        return json(400, { error: "No fields to update" });
      }

      const updated = await updateBlogArticle(config, id, normalized);
      if (!updated) return json(404, { error: "Article not found" });
      return json(200, { article: mapArticle(updated) });
    }

    if (method === "DELETE") {
      const payload = parseJsonBody(event);
      const id = (query.id || payload.id || "").toString().trim();
      if (!id) return json(400, { error: "id is required" });

      const deleted = await softDeleteBlogArticle(config, id);
      if (!deleted) return json(404, { error: "Article not found" });
      return json(200, { article: mapArticle(deleted) });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { error: err.message });
    }
    return json(500, { error: err.message || "Erro ao gerir artigos" });
  }
};
