const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireRole } = require("./_lib/authz");
const { listTrainingPrograms, createTrainingProgram, updateTrainingProgram } = require("./_lib/supabase");
const { createStripeProductAndPrice, getStripeClient, syncStripeStatus } = require("./_lib/stripe");

function normalizeProgramPayload(payload) {
  const name = (payload.name || "").toString().trim();
  const externalSource = (payload.externalSource || "trainingpeaks").toString().trim().toLowerCase() || "trainingpeaks";
  const externalId = payload.externalId == null ? null : payload.externalId.toString().trim() || null;
  const description = payload.description == null ? null : payload.description.toString();
  const durationWeeks = Number(payload.durationWeeks);
  const priceCents = Number(payload.priceCents ?? 0);
  const currency = (payload.currency || "EUR").toString().trim().toUpperCase() || "EUR";
  const stripeProductId = payload.stripeProductId == null ? null : payload.stripeProductId.toString().trim() || null;
  const stripePriceId = payload.stripePriceId == null ? null : payload.stripePriceId.toString().trim() || null;
  const billingType = (payload.billingType || "one_time").toString().trim().toLowerCase() || "one_time";
  const followupType = (payload.followupType || "standard").toString().trim() || "standard";
  const status = (payload.status || "draft").toString().trim().toLowerCase();
  const isScheduledTemplate = Boolean(payload.isScheduledTemplate);

  if (!name) throw new Error("name is required");
  if (!Number.isInteger(durationWeeks) || durationWeeks <= 0) throw new Error("durationWeeks must be a positive integer");
  if (!Number.isInteger(priceCents) || priceCents < 0) throw new Error("priceCents must be a non-negative integer");
  if (!["one_time", "recurring"].includes(billingType)) throw new Error("billingType must be one_time or recurring");
  if (!["draft", "active", "archived"].includes(status)) throw new Error("status must be draft, active or archived");

  return {
    name,
    external_source: externalSource,
    external_id: externalId,
    description,
    duration_weeks: durationWeeks,
    price_cents: priceCents,
    currency,
    stripe_product_id: stripeProductId,
    stripe_price_id: stripePriceId,
    billing_type: billingType,
    followup_type: followupType,
    status,
    is_scheduled_template: isScheduledTemplate
  };
}

function mapProgram(row) {
  return {
    id: row.id,
    name: row.name,
    externalSource: row.external_source,
    externalId: row.external_id,
    description: row.description,
    durationWeeks: row.duration_weeks,
    priceCents: row.price_cents,
    currency: row.currency,
    stripeProductId: row.stripe_product_id || null,
    stripePriceId: row.stripe_price_id || null,
    billingType: row.billing_type || "one_time",
    followupType: row.followup_type,
    status: row.status,
    isScheduledTemplate: row.is_scheduled_template,
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

      // Sync-stripe: verifica estado de products/prices no Stripe
      if (qs.action === "sync-stripe") {
        const stripe = getStripeClient(config);
        const rows = await listTrainingPrograms(config);
        const programs = Array.isArray(rows) ? rows : [];
        const results = [];
        for (const p of programs) {
          if (!p.stripe_product_id && !p.stripe_price_id) {
            results.push({ id: p.id, name: p.name, sync: "no_stripe" });
            continue;
          }
          const status = await syncStripeStatus({ productId: p.stripe_product_id, priceId: p.stripe_price_id });
          const synced = status.productActive && status.priceActive;
          const warning = (p.status === "active" && !synced);
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

      const rows = await listTrainingPrograms(config);
      return json(200, { programs: Array.isArray(rows) ? rows.map(mapProgram) : [] });
    }


    if (method === "POST") {
      const payload = parseJsonBody(event);
      let normalized = normalizeProgramPayload(payload);

      // Se solicitado, criar produto/preço no Stripe
      if (payload.createStripeProductAndPrice) {
        if (!normalized.name || !normalized.price_cents || !normalized.currency) {
          return json(400, { error: "Nome, preço e moeda são obrigatórios para criar produto Stripe" });
        }
        try {
          getStripeClient(config);
          const recurring = normalized.billing_type === "recurring";
          const { productId, priceId } = await createStripeProductAndPrice({
            name: normalized.name,
            description: normalized.description,
            priceCents: normalized.price_cents,
            currency: normalized.currency,
            recurring
          });
          normalized.stripe_product_id = productId;
          normalized.stripe_price_id = priceId;
        } catch (err) {
          return json(500, { error: "Erro ao criar produto/preço no Stripe: " + (err.message || err) });
        }
      }
      const created = await createTrainingProgram(config, normalized);
      return json(201, { program: mapProgram(created) });
    }

    if (method === "PATCH") {
      // PATCH /admin-programs/:id
      const id = event.path.split("/").pop();
      if (!id) return json(400, { error: "Missing program id in path" });
      const patch = parseJsonBody(event);
      // Validação básica para status
      if (patch.status && !["draft", "active", "archived"].includes(patch.status)) {
        return json(400, { error: "Invalid status value" });
      }
      const updated = await updateTrainingProgram(config, id, patch);
      if (!updated) return json(404, { error: "Program not found" });
      return json(200, { program: mapProgram(updated) });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    return json(500, { error: err.message || "Erro ao gerir programas" });
  }
};
