const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  getBlogArticleById,
  getBlogContentProductionByArticle,
  upsertBlogContentProduction,
  updateBlogContentProductionByArticle
} = require("./_lib/supabase");
const { generateBlogWhatsappPack } = require("./_lib/ai");

class ValidationError extends Error {}

function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function safeString(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeBriefing(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    topic: safeString(data.topic),
    objective: safeString(data.objective),
    tone: safeString(data.tone),
    cta: safeString(data.cta),
    targetAudience: safeString(data.targetAudience),
    category: safeString(data.category),
    lengthHint: safeString(data.lengthHint)
  };
}

function normalizeArticleSeed(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    title: safeString(data.title),
    excerpt: safeString(data.excerpt),
    category: safeString(data.category) || "Artigo",
    content: data.content == null ? "" : String(data.content)
  };
}

function normalizeVariants(raw) {
  const labels = ["A", "B", "C"];
  const list = Array.isArray(raw) ? raw : [];
  return labels.map((label, index) => {
    const row = list[index] || list.find((item) => safeString(item && item.label).toUpperCase() === label) || {};
    return {
      label,
      text: safeString(row.text)
    };
  });
}

function mapProduction(row) {
  if (!row) return null;
  const generatedBlog = row.generated_blog && typeof row.generated_blog === "object" ? row.generated_blog : {};
  return {
    id: row.id,
    articleId: row.article_id,
    status: row.status || "not_generated",
    briefing: row.briefing_data && typeof row.briefing_data === "object" ? row.briefing_data : {},
    generatedBlog: {
      title: safeString(generatedBlog.title),
      excerpt: safeString(generatedBlog.excerpt),
      category: safeString(generatedBlog.category) || "Artigo",
      content: generatedBlog.content == null ? "" : String(generatedBlog.content)
    },
    whatsappVariants: normalizeVariants(row.whatsapp_variants),
    selectedVariant: safeString(row.selected_variant).toUpperCase() || null,
    regenerateOnPublish: row.regenerate_on_publish !== false,
    manualSharedAt: row.manual_shared_at || null,
    generationError: row.generation_error || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null
  };
}

async function getArticleSeed(config, articleId, payloadArticle) {
  if (articleId) {
    const article = await getBlogArticleById(config, articleId);
    if (!article) throw new ValidationError("Article not found");
    return {
      title: safeString(article.title),
      excerpt: safeString(article.excerpt),
      category: safeString(article.category) || "Artigo",
      content: article.content == null ? "" : String(article.content)
    };
  }

  const seed = normalizeArticleSeed(payloadArticle);
  if (!seed.title && !seed.content) {
    throw new ValidationError("articleId or article seed is required");
  }
  return seed;
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  if (!["GET", "POST", "PATCH"].includes(method)) {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireRole(event, config, "admin");
    if (auth.error) return auth.error;

    const params = new URLSearchParams(event.rawQuery || "");

    if (method === "GET") {
      const articleId = safeString(params.get("articleId"));
      if (!articleId) throw new ValidationError("articleId is required");
      const row = await getBlogContentProductionByArticle(config, articleId);
      return json(200, { production: mapProduction(row) });
    }

    const payload = parseJsonBody(event);

    if (method === "POST") {
      // Novo fluxo: modo explícito
      const mode = safeString(payload.mode || "").toLowerCase();
      const articleId = safeString(payload.articleId);
      const briefing = normalizeBriefing(payload.briefing);
      const regenerateOnPublish = parseBoolean(payload.regenerateOnPublish, true);
      // Inputs extras para ABC WhatsApp
      const abcInstructions = safeString(payload.abcInstructions);
      const abcCta = safeString(payload.abcCta);

      let articleSeed = null;
      let result = null;

      if (mode === "article" && articleId) {
        // Geração baseada em artigo selecionado
        articleSeed = await getArticleSeed(config, articleId, payload.article);
        result = await generateBlogWhatsappPack({
          config,
          apiKey: config.geminiApiKey,
          modelName: config.geminiModel,
          article: articleSeed,
          briefing: { ...briefing, cta: abcCta, instructions: abcInstructions },
          articleId
        });
        const saved = await upsertBlogContentProduction(config, {
          article_id: articleId,
          status: result.generationSource === "fallback" ? "failed_generation" : "generated",
          briefing_data: { ...briefing, cta: abcCta, instructions: abcInstructions },
          generated_blog: result.blog,
          whatsapp_variants: normalizeVariants(result.whatsappVariants),
          regenerate_on_publish: regenerateOnPublish,
          generation_error: result.generationSource === "fallback" ? "Fallback generation used" : null,
          selected_variant: null,
          manual_shared_at: null,
          updated_at: new Date().toISOString()
        });
        return json(200, { production: mapProduction(saved) });
      } else if (mode === "idea") {
        // Criação de draft de artigo a partir de uma ideia
        articleSeed = normalizeArticleSeed(payload.article);
        result = await generateBlogWhatsappPack({
          config,
          apiKey: config.geminiApiKey,
          modelName: config.geminiModel,
          article: articleSeed,
          briefing: { ...briefing, cta: abcCta, instructions: abcInstructions },
          articleId: null
        });
        return json(200, {
          production: {
            id: null,
            articleId: null,
            status: result.generationSource === "fallback" ? "failed_generation" : "generated",
            briefing: { ...briefing, cta: abcCta, instructions: abcInstructions },
            generatedBlog: result.blog,
            whatsappVariants: normalizeVariants(result.whatsappVariants),
            selectedVariant: null,
            regenerateOnPublish,
            manualSharedAt: null,
            generationError: result.generationSource === "fallback" ? "Fallback generation used" : null,
            updatedAt: new Date().toISOString(),
            createdAt: null
          }
        });
      } else if (mode === "abc") {
        // Criação de ABC WhatsApp sem dependência de artigo
        // Permite inputs livres para briefing/cta/instruções
        result = await generateBlogWhatsappPack({
          config,
          apiKey: config.geminiApiKey,
          modelName: config.geminiModel,
          article: {},
          briefing: { ...briefing, cta: abcCta, instructions: abcInstructions },
          articleId: null
        });
        return json(200, {
          production: {
            id: null,
            articleId: null,
            status: result.generationSource === "fallback" ? "failed_generation" : "generated",
            briefing: { ...briefing, cta: abcCta, instructions: abcInstructions },
            generatedBlog: {},
            whatsappVariants: normalizeVariants(result.whatsappVariants),
            selectedVariant: null,
            regenerateOnPublish,
            manualSharedAt: null,
            generationError: result.generationSource === "fallback" ? "Fallback generation used" : null,
            updatedAt: new Date().toISOString(),
            createdAt: null
          }
        });
      } else {
        throw new ValidationError("Modo de produção inválido ou parâmetros insuficientes");
      }
    }

    const articleId = safeString(payload.articleId);
    if (!articleId) throw new ValidationError("articleId is required");

    const patch = {};

    if (payload.regenerateOnPublish != null) {
      patch.regenerate_on_publish = parseBoolean(payload.regenerateOnPublish, true);
    }

    const selectedVariant = safeString(payload.selectedVariant).toUpperCase();
    if (selectedVariant) {
      if (!["A", "B", "C"].includes(selectedVariant)) {
        throw new ValidationError("selectedVariant must be A, B or C");
      }
      patch.selected_variant = selectedVariant;
    }

    if (Array.isArray(payload.whatsappVariants)) {
      patch.whatsapp_variants = normalizeVariants(payload.whatsappVariants);
    }

    if (parseBoolean(payload.markShared, false)) {
      patch.status = "shared_manual";
      patch.manual_shared_at = new Date().toISOString();
    }

    if (!Object.keys(patch).length) {
      throw new ValidationError("No fields to update");
    }

    patch.updated_at = new Date().toISOString();

    let updated = await updateBlogContentProductionByArticle(config, articleId, patch);
    if (!updated) {
      updated = await upsertBlogContentProduction(config, {
        article_id: articleId,
        status: patch.status || "not_generated",
        regenerate_on_publish: patch.regenerate_on_publish !== false,
        selected_variant: patch.selected_variant || null,
        whatsapp_variants: patch.whatsapp_variants || [],
        briefing_data: {},
        generated_blog: {},
        manual_shared_at: patch.manual_shared_at || null,
        generation_error: null,
        updated_at: patch.updated_at
      });
    }

    return json(200, { production: mapProduction(updated) });
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { error: err.message });
    }
    return json(500, { error: err.message || "Erro na linha de producao do blog" });
  }
};
