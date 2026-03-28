const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const {
  getBlogArticleById,
  getBlogContentProductionByArticle,
  upsertBlogContentProduction,
  updateBlogContentProductionByArticle,
  getBlogContentProductionById,
  updateBlogContentProductionById,
  insertBlogContentProduction,
  listStandaloneProductions
} = require("./_lib/supabase");
const {
  generateBlogWhatsappPack,
  generateAbcFromArticle,
  generateDraftFromIdea,
  generateAbcStandalone
} = require("./_lib/ai");

const VALID_MODES = ["full", "abc_from_article", "draft_from_idea", "abc_standalone"];
const VALID_WORKFLOW_STAGES = ["idea", "draft_ready", "article_saved", "published", "abc_ready", "variant_selected", "shared_manual"];

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

function normalizeWorkflowStage(value) {
  const stage = safeString(value).toLowerCase();
  if (!stage) return "";
  if (!VALID_WORKFLOW_STAGES.includes(stage)) {
    throw new ValidationError(`workflowStage must be one of: ${VALID_WORKFLOW_STAGES.join(", ")}`);
  }
  return stage;
}

function deriveWorkflowStage(row) {
  const stored = safeString(row && row.workflow_stage).toLowerCase();
  if (VALID_WORKFLOW_STAGES.includes(stored)) return stored;

  const status = safeString(row && row.status).toLowerCase();
  const selectedVariant = safeString(row && row.selected_variant).toUpperCase();
  const generatedBlog = row && row.generated_blog && typeof row.generated_blog === "object" ? row.generated_blog : {};
  const hasGeneratedBlog = Boolean(safeString(generatedBlog.title) || safeString(generatedBlog.content));
  const hasVariants = normalizeVariants(row && row.whatsapp_variants).some((item) => item.text);

  if (row && row.manual_shared_at) return "shared_manual";
  if (["A", "B", "C"].includes(selectedVariant)) return "variant_selected";
  if (hasVariants || status === "generated" || status === "failed_generation") return "abc_ready";
  if (row && row.article_id) return "article_saved";
  if (hasGeneratedBlog) return "draft_ready";
  return "idea";
}

function isMissingWorkflowColumnError(error) {
  const message = safeString(error && error.message).toLowerCase();
  return message.includes("workflow_stage") && (message.includes("column") || message.includes("schema cache"));
}

function withoutWorkflowColumn(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  delete next.workflow_stage;
  return next;
}

async function runProductionMutation(operation, payload) {
  try {
    return await operation(payload);
  } catch (error) {
    if (!isMissingWorkflowColumnError(error) || !payload || payload.workflow_stage === undefined) {
      throw error;
    }
    return operation(withoutWorkflowColumn(payload));
  }
}

function mapProduction(row) {
  if (!row) return null;
  const generatedBlog = row.generated_blog && typeof row.generated_blog === "object" ? row.generated_blog : {};
  return {
    id: row.id,
    articleId: row.article_id || null,
    status: row.status || "not_generated",
    generationMode: row.generation_mode || "full",
    workflowStage: deriveWorkflowStage(row),
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
    extraInstructions: row.extra_instructions || "",
    manualSharedAt: row.manual_shared_at || null,
    generationError: row.generation_error || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null
  };
}

async function loadArticleSeed(config, articleId) {
  const article = await getBlogArticleById(config, articleId);
  if (!article) throw new ValidationError("Article not found");
  const baseUrl = safeString(config && config.siteUrl).replace(/\/+$/, "");
  const slug = safeString(article.slug);
  const articleUrl = baseUrl && slug ? `${baseUrl}/blog/${encodeURIComponent(slug)}` : "";
  return {
    title: safeString(article.title),
    excerpt: safeString(article.excerpt),
    category: safeString(article.category) || "Artigo",
    content: article.content == null ? "" : String(article.content),
    slug,
    url: articleUrl
  };
}

/* ------------------------------------------------------------------ */
/* POST mode handlers                                                 */
/* ------------------------------------------------------------------ */

async function handlePostFull(config, payload) {
  const articleId = safeString(payload.articleId);
  const briefing = normalizeBriefing(payload.briefing);
  const extraInstructions = safeString(payload.extraInstructions);
  const regenerateOnPublish = parseBoolean(payload.regenerateOnPublish, true);

  let articleSeed;
  if (articleId) {
    articleSeed = await loadArticleSeed(config, articleId);
  } else {
    articleSeed = normalizeArticleSeed(payload.article);
    if (!articleSeed.title && !articleSeed.content) {
      throw new ValidationError("articleId or article seed is required");
    }
  }

  const generated = await generateBlogWhatsappPack({
    config,
    apiKey: config.geminiApiKey,
    modelName: config.geminiModel,
    article: articleSeed,
    briefing,
    articleId: articleId || null
  });

  const status = generated.generationSource === "fallback" ? "failed_generation" : "generated";
  const error = generated.generationSource === "fallback" ? "Fallback generation used" : null;

  if (!articleId) {
    return json(200, {
      production: {
        id: null, articleId: null, status, generationMode: "full",
        workflowStage: "draft_ready",
        briefing, generatedBlog: generated.blog,
        whatsappVariants: normalizeVariants(generated.whatsappVariants),
        selectedVariant: null, regenerateOnPublish, extraInstructions,
        manualSharedAt: null, generationError: error,
        updatedAt: new Date().toISOString(), createdAt: null
      }
    });
  }

  const saved = await runProductionMutation((nextPayload) => upsertBlogContentProduction(config, nextPayload), {
    article_id: articleId, status, generation_mode: "full",
    briefing_data: briefing, generated_blog: generated.blog,
    whatsapp_variants: normalizeVariants(generated.whatsappVariants),
    regenerate_on_publish: regenerateOnPublish,
    extra_instructions: extraInstructions,
    generation_error: error, selected_variant: null,
    manual_shared_at: null, updated_at: new Date().toISOString(),
    workflow_stage: "abc_ready"
  });
  return json(200, { production: mapProduction(saved) });
}

async function handlePostAbcFromArticle(config, payload) {
  const articleId = safeString(payload.articleId);
  if (!articleId) throw new ValidationError("articleId is required for abc_from_article mode");

  const briefing = normalizeBriefing(payload.briefing);
  const extraInstructions = safeString(payload.extraInstructions);
  const articleSeed = await loadArticleSeed(config, articleId);

  const generated = await generateAbcFromArticle({
    config,
    apiKey: config.geminiApiKey,
    modelName: config.geminiModel,
    article: articleSeed,
    briefing,
    extraInstructions,
    articleId
  });

  const status = generated.generationSource === "fallback" ? "failed_generation" : "generated";
  const error = generated.generationSource === "fallback" ? "Fallback generation used" : null;

  const existing = await getBlogContentProductionByArticle(config, articleId);
  const preservedGeneratedBlog = existing && existing.generated_blog && typeof existing.generated_blog === "object"
    ? existing.generated_blog
    : {};
  const preservedSelectedVariant = existing ? safeString(existing.selected_variant).toUpperCase() || null : null;

  const saved = await runProductionMutation((nextPayload) => upsertBlogContentProduction(config, nextPayload), {
    article_id: articleId, status, generation_mode: "abc_from_article",
    briefing_data: briefing, generated_blog: preservedGeneratedBlog,
    whatsapp_variants: normalizeVariants(generated.whatsappVariants),
    regenerate_on_publish: false,
    extra_instructions: extraInstructions,
    generation_error: error, selected_variant: preservedSelectedVariant,
    manual_shared_at: null, updated_at: new Date().toISOString(),
    workflow_stage: preservedSelectedVariant ? "variant_selected" : "abc_ready"
  });
  return json(200, { production: mapProduction(saved) });
}

async function handlePostDraftFromIdea(config, payload) {
  const briefing = normalizeBriefing(payload.briefing);
  if (!briefing.topic) throw new ValidationError("briefing.topic is required for draft_from_idea mode");

  const extraInstructions = safeString(payload.extraInstructions);

  const generated = await generateDraftFromIdea({
    config,
    apiKey: config.geminiApiKey,
    modelName: config.geminiModel,
    briefing,
    extraInstructions
  });

  const status = generated.generationSource === "fallback" ? "failed_generation" : "generated";
  const error = generated.generationSource === "fallback" ? "Fallback generation used" : null;

  const saved = await runProductionMutation((nextPayload) => insertBlogContentProduction(config, nextPayload), {
    article_id: null, status, generation_mode: "draft_from_idea",
    briefing_data: briefing, generated_blog: generated.blog,
    whatsapp_variants: [],
    regenerate_on_publish: false,
    extra_instructions: extraInstructions,
    generation_error: error, selected_variant: null,
    manual_shared_at: null, updated_at: new Date().toISOString(),
    workflow_stage: "draft_ready"
  });
  return json(200, { production: mapProduction(saved) });
}

async function handlePostAbcStandalone(config, payload) {
  const briefing = normalizeBriefing(payload.briefing);
  if (!briefing.topic) throw new ValidationError("briefing.topic is required for abc_standalone mode");

  const extraInstructions = safeString(payload.extraInstructions);

  const generated = await generateAbcStandalone({
    config,
    apiKey: config.geminiApiKey,
    modelName: config.geminiModel,
    briefing,
    extraInstructions
  });

  const status = generated.generationSource === "fallback" ? "failed_generation" : "generated";
  const error = generated.generationSource === "fallback" ? "Fallback generation used" : null;

  const saved = await runProductionMutation((nextPayload) => insertBlogContentProduction(config, nextPayload), {
    article_id: null, status, generation_mode: "abc_standalone",
    briefing_data: briefing, generated_blog: {},
    whatsapp_variants: normalizeVariants(generated.whatsappVariants),
    regenerate_on_publish: false,
    extra_instructions: extraInstructions,
    generation_error: error, selected_variant: null,
    manual_shared_at: null, updated_at: new Date().toISOString(),
    workflow_stage: "abc_ready"
  });
  return json(200, { production: mapProduction(saved) });
}

/* ------------------------------------------------------------------ */
/* Main handler                                                       */
/* ------------------------------------------------------------------ */

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

    /* ---- GET ---- */
    if (method === "GET") {
      const articleId = safeString(params.get("articleId"));
      const recordId = safeString(params.get("id"));
      const standalone = safeString(params.get("standalone"));

      if (standalone === "true" || standalone === "1") {
        const rows = await listStandaloneProductions(config, 30);
        return json(200, { productions: rows.map(mapProduction) });
      }

      if (recordId) {
        const row = await getBlogContentProductionById(config, recordId);
        return json(200, { production: mapProduction(row) });
      }

      if (!articleId) throw new ValidationError("articleId, id, or standalone=true is required");
      const row = await getBlogContentProductionByArticle(config, articleId);
      return json(200, { production: mapProduction(row) });
    }

    const payload = parseJsonBody(event);

    /* ---- POST ---- */
    if (method === "POST") {
      const mode = safeString(payload.mode) || "full";
      if (!VALID_MODES.includes(mode)) {
        throw new ValidationError(`Invalid mode: ${mode}. Must be one of: ${VALID_MODES.join(", ")}`);
      }

      if (mode === "abc_from_article") return handlePostAbcFromArticle(config, payload);
      if (mode === "draft_from_idea") return handlePostDraftFromIdea(config, payload);
      if (mode === "abc_standalone") return handlePostAbcStandalone(config, payload);
      return handlePostFull(config, payload);
    }

    /* ---- PATCH ---- */
    const articleId = safeString(payload.articleId);
    const recordId = safeString(payload.id);
    if (!articleId && !recordId) throw new ValidationError("articleId or id is required");

    const patch = {};

    if (payload.regenerateOnPublish != null) {
      patch.regenerate_on_publish = parseBoolean(payload.regenerateOnPublish, true);
    }

    const workflowStage = normalizeWorkflowStage(payload.workflowStage);
    if (workflowStage) {
      patch.workflow_stage = workflowStage;
    }

    const linkArticleId = safeString(payload.linkArticleId);
    if (linkArticleId) {
      patch.article_id = linkArticleId;
      if (!patch.workflow_stage) {
        patch.workflow_stage = "article_saved";
      }
    }

    const selectedVariant = safeString(payload.selectedVariant).toUpperCase();
    if (selectedVariant) {
      if (!["A", "B", "C"].includes(selectedVariant)) {
        throw new ValidationError("selectedVariant must be A, B or C");
      }
      patch.selected_variant = selectedVariant;
      if (!patch.workflow_stage) {
        patch.workflow_stage = "variant_selected";
      }
    }

    if (Array.isArray(payload.whatsappVariants)) {
      patch.whatsapp_variants = normalizeVariants(payload.whatsappVariants);
    }

    if (parseBoolean(payload.markShared, false)) {
      patch.status = "shared_manual";
      patch.manual_shared_at = new Date().toISOString();
      patch.workflow_stage = "shared_manual";
    }

    if (!Object.keys(patch).length) {
      throw new ValidationError("No fields to update");
    }

    patch.updated_at = new Date().toISOString();

    let updated;
    if (recordId) {
      updated = await runProductionMutation((nextPayload) => updateBlogContentProductionById(config, recordId, nextPayload), patch);
    } else {
      updated = await runProductionMutation((nextPayload) => updateBlogContentProductionByArticle(config, articleId, nextPayload), patch);
      if (!updated) {
        updated = await runProductionMutation((nextPayload) => upsertBlogContentProduction(config, nextPayload), {
          article_id: articleId,
          status: patch.status || "not_generated",
          generation_mode: "full",
          regenerate_on_publish: patch.regenerate_on_publish !== false,
          selected_variant: patch.selected_variant || null,
          whatsapp_variants: patch.whatsapp_variants || [],
          briefing_data: {},
          generated_blog: {},
          extra_instructions: "",
          manual_shared_at: patch.manual_shared_at || null,
          generation_error: null,
          updated_at: patch.updated_at,
          workflow_stage: patch.workflow_stage || (patch.selected_variant ? "variant_selected" : (patch.manual_shared_at ? "shared_manual" : "article_saved"))
        });
      }
    }

    return json(200, { production: mapProduction(updated) });
  } catch (err) {
    if (err instanceof ValidationError) {
      return json(400, { error: err.message });
    }
    return json(500, { error: err.message || "Erro na linha de producao do blog" });
  }
};
