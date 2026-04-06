const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  listBlogCategories,
  getBlogCategoryById,
  getBlogCategoryByName,
  createBlogCategory,
  updateBlogCategory,
  listBlogArticlesAdmin,
  reassignBlogArticlesCategory
} = require("./_lib/supabase");

class ValidationError extends Error {}

function normalizeName(value, fieldName = "name") {
  const normalized = String(value || "").trim();
  if (!normalized) throw new ValidationError(`${fieldName} is required`);
  return normalized;
}

function mapCategory(row, articleCount = 0) {
  return {
    id: row.id,
    name: row.name,
    isLocked: row.is_locked === true,
    articleCount: Number.isInteger(articleCount) ? articleCount : 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function buildCountsByCategoryName(articles) {
  const counts = new Map();
  for (const article of articles || []) {
    const name = String((article && article.category) || "Artigo").trim() || "Artigo";
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return counts;
}

async function handleList(config) {
  const [categoriesRows, articlesRows] = await Promise.all([
    listBlogCategories(config),
    listBlogArticlesAdmin(config)
  ]);

  const counts = buildCountsByCategoryName(articlesRows);
  const categories = (categoriesRows || []).map((row) => mapCategory(row, counts.get(row.name) || 0));

  return json(200, { categories });
}

async function handleCreate(config, event) {
  const payload = parseJsonBody(event);
  const name = normalizeName(payload.name);
  const existing = await getBlogCategoryByName(config, name);
  if (existing) {
    return json(409, { error: "Category already exists" });
  }

  const created = await createBlogCategory(config, { name, is_locked: false });
  return json(201, {
    category: mapCategory(created, 0),
    message: "Category created successfully"
  });
}

async function handleRename(config, event) {
  const payload = parseJsonBody(event);
  const id = normalizeName(payload.id, "id");
  const name = normalizeName(payload.name);

  const existing = await getBlogCategoryById(config, id);
  if (!existing) return json(404, { error: "Category not found" });
  if (existing.is_locked) {
    return json(400, { error: "This category is locked and cannot be renamed" });
  }

  if (existing.name === name) {
    return json(200, {
      category: mapCategory(existing),
      renamedArticles: 0,
      message: "Category unchanged"
    });
  }

  const duplicate = await getBlogCategoryByName(config, name);
  if (duplicate && duplicate.id !== existing.id) {
    return json(409, { error: "Category already exists" });
  }

  const renamedArticles = await reassignBlogArticlesCategory(config, existing.name, name);
  const updated = await updateBlogCategory(config, existing.id, { name });

  return json(200, {
    category: mapCategory(updated, renamedArticles.length),
    renamedArticles: renamedArticles.length,
    message: "Category renamed successfully"
  });
}

async function handleDelete(config, event) {
  const payload = parseJsonBody(event);
  const id = normalizeName(payload.id, "id");

  const existing = await getBlogCategoryById(config, id);
  if (!existing) return json(404, { error: "Category not found" });
  if (existing.is_locked) {
    return json(400, { error: "This category is locked and cannot be deleted" });
  }

  const replacementCategoryName = normalizeName(payload.replacementCategory || "Artigo", "replacementCategory");
  if (replacementCategoryName === existing.name) {
    throw new ValidationError("replacementCategory must be different from the category being deleted");
  }

  const replacement = await getBlogCategoryByName(config, replacementCategoryName);
  if (!replacement) {
    return json(404, { error: "Replacement category not found" });
  }

  const reassignedArticles = await reassignBlogArticlesCategory(config, existing.name, replacement.name);
  await updateBlogCategory(config, existing.id, { deleted_at: new Date().toISOString() });

  return json(200, {
    deletedCategoryId: existing.id,
    replacementCategory: replacement.name,
    reassignedArticles: reassignedArticles.length,
    message: "Category deleted successfully"
  });
}

exports.handler = async (event) => {
  const method = event.httpMethod;

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    if (method === "GET") {
      return handleList(config);
    }
    if (method === "POST") {
      return handleCreate(config, event);
    }
    if (method === "PATCH") {
      return handleRename(config, event);
    }
    if (method === "DELETE") {
      return handleDelete(config, event);
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { error: err.message });
    }
    console.error("[admin-blog-categories]", err);
    return json(500, { error: err.message || "Erro ao gerir categorias do blog" });
  }
};