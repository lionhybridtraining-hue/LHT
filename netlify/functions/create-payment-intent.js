const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { resolveProgram } = require("./_lib/program-access");
const { getStripeClient, normalizeStripeError } = require("./_lib/stripe");
const { sendCAPIEvent, buildUserData } = require("./_lib/meta-capi");

function getCookieValue(cookies, key) {
  if (!cookies || !key) return "";
  const pattern = new RegExp(`(?:^|;\\s*)${key}=([^;]+)`);
  const match = cookies.match(pattern);
  return match ? match[1] : "";
}

async function getOrCreateCustomer(stripe, { email, identityId }) {
  if (!email) {
    return stripe.customers.create({
      metadata: identityId ? { identity_id: identityId } : {}
    });
  }

  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing && Array.isArray(existing.data) && existing.data[0]) {
    return existing.data[0];
  }

  return stripe.customers.create({
    email,
    metadata: identityId ? { identity_id: identityId } : {}
  });
}

async function resolvePromotionCode(stripe, code) {
  if (!code || typeof code !== "string") return null;
  const sanitized = code.trim().slice(0, 100);
  if (!sanitized) return null;
  const list = await stripe.promotionCodes.list({ code: sanitized, active: true, limit: 1 });
  if (!list || !Array.isArray(list.data) || !list.data[0]) return null;
  const promo = list.data[0];
  if (!promo.coupon || !promo.coupon.valid) return null;
  return promo;
}

function resolvePriceId(program, billingInterval) {
  const interval = String(billingInterval || "").trim().toLowerCase();
  if (program.billing_type !== "recurring") {
    return program.stripe_price_id || null;
  }

  const recurringPriceMap = {
    monthly: program.stripe_price_id_monthly || program.stripe_price_id || null,
    quarterly: program.stripe_price_id_quarterly || null,
    annual: program.stripe_price_id_annual || null
  };

  if (!interval) return recurringPriceMap.monthly;
  if (!Object.prototype.hasOwnProperty.call(recurringPriceMap, interval)) return null;
  return recurringPriceMap[interval] || null;
}

function getAvailableRecurringIntervals(program) {
  if (program.billing_type !== "recurring") return [];
  const map = {
    monthly: program.stripe_price_id_monthly || program.stripe_price_id || null,
    quarterly: program.stripe_price_id_quarterly || null,
    annual: program.stripe_price_id_annual || null
  };
  return Object.keys(map).filter((interval) => !!map[interval]);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await requireAuthenticatedUser(event, config);
    if (auth.error) return auth.error;

    const body = parseJsonBody(event);
    const program = await resolveProgram(config, {
      programId: body.program_id,
      programExternalId: body.program_external_id
    });

    if (!program || program.status !== "active") {
      return json(404, { error: "Programa indisponivel" });
    }

    const requestedBillingInterval = (body.billing_interval || "").toString().trim().toLowerCase();
    const resolvedBillingInterval = program.billing_type === "recurring"
      ? (requestedBillingInterval || "monthly")
      : "";
    const priceId = resolvePriceId(program, requestedBillingInterval);

    if (!priceId) {
      if (program.billing_type === "recurring") {
        const availableIntervals = getAvailableRecurringIntervals(program);
        return json(400, {
          error: "Programa sem Stripe Price configurado para o intervalo selecionado",
          requestedInterval: resolvedBillingInterval,
          availableIntervals
        });
      }
      return json(400, { error: "Programa sem Stripe Price configurado" });
    }

    const stripe = getStripeClient(config);
    const price = await stripe.prices.retrieve(priceId);
    if (!price || !Number.isFinite(price.unit_amount) || !price.currency) {
      return json(400, { error: "Stripe Price invalido para o programa" });
    }

    // Resolve coupon if provided
    const couponCode = (body.coupon_code || "").toString().trim();
    let promo = null;
    if (couponCode) {
      promo = await resolvePromotionCode(stripe, couponCode);
      if (!promo) {
        return json(400, { error: "Codigo de desconto invalido ou expirado" });
      }
    }

    const cookies = event.headers.cookie || event.headers.Cookie || "";
    const fbp = getCookieValue(cookies, "_fbp");
    const fbc = getCookieValue(cookies, "_fbc");

    const metadata = {
      program_id: program.id,
      program_external_id: program.external_id || "",
      identity_id: auth.user.sub,
      billing_type: program.billing_type || "one_time",
      billing_interval: resolvedBillingInterval,
      email: auth.user.email || "",
      event_source_url: body.event_source_url || "",
      fbp,
      fbc
    };

    let paymentIntent = null;
    let subscriptionId = null;

    if (program.billing_type === "recurring") {
      const customer = await getOrCreateCustomer(stripe, {
        email: auth.user.email || "",
        identityId: auth.user.sub
      });

      const subParams = {
        customer: customer.id,
        items: [{ price: priceId }],
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
          payment_method_types: ["card", "sepa_debit"]
        },
        metadata,
        expand: ["latest_invoice.payment_intent"]
      };

      if (promo && promo.coupon) {
        subParams.coupon = promo.coupon.id;
      }

      const subscription = await stripe.subscriptions.create(subParams);

      subscriptionId = subscription.id;
      paymentIntent = subscription.latest_invoice && subscription.latest_invoice.payment_intent
        ? subscription.latest_invoice.payment_intent
        : null;

      if (!paymentIntent) {
        return json(500, { error: "Nao foi possivel iniciar o pagamento da subscricao" });
      }

      if (typeof paymentIntent === "string") {
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent);
      }

      await stripe.paymentIntents.update(paymentIntent.id, {
        metadata: {
          ...metadata,
          subscription_id: subscriptionId
        }
      });
    } else {
      const piParams = {
        amount: price.unit_amount,
        currency: price.currency,
        metadata,
        receipt_email: auth.user.email || undefined,
        automatic_payment_methods: { enabled: true }
      };

      // Apply coupon discount to one-time payment
      if (promo && promo.coupon) {
        const coupon = promo.coupon;
        if (coupon.amount_off && Number.isFinite(coupon.amount_off)) {
          piParams.amount = Math.max(0, piParams.amount - coupon.amount_off);
        } else if (coupon.percent_off && Number.isFinite(coupon.percent_off)) {
          piParams.amount = Math.max(0, Math.round(piParams.amount * (1 - coupon.percent_off / 100)));
        }
        piParams.metadata.coupon_code = couponCode;
        piParams.metadata.coupon_id = coupon.id;
      }

      paymentIntent = await stripe.paymentIntents.create(piParams);
    }

    if (config.metaCapiAccessToken && config.metaDatasetId) {
      try {
        await sendCAPIEvent(config, {
          event_name: "InitiateCheckout",
          event_time: Math.floor(Date.now() / 1000),
          event_id: `checkout_pi_${paymentIntent.id}`,
          action_source: "website",
          event_source_url: body.event_source_url || `${config.siteUrl}/programas.html`,
          user_data: buildUserData({
            email: auth.user.email,
            fbp: fbp || undefined,
            fbc: fbc || undefined,
            clientIpAddress: (event.headers["x-forwarded-for"] || event.headers["x-nf-client-connection-ip"] || "").split(",")[0].trim() || undefined,
            clientUserAgent: event.headers["user-agent"] || undefined
          }),
          custom_data: {
            value: (paymentIntent.amount || 0) / 100,
            currency: String(price.currency || "EUR").toUpperCase(),
            content_ids: [program.external_id || program.id],
            content_type: "product",
            content_name: program.name
          }
        });
      } catch (err) {
        console.error("create-payment-intent: CAPI InitiateCheckout failed:", err.message);
      }
    }

    return json(200, {
      ok: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      subscriptionId,
      program: {
        id: program.id,
        externalId: program.external_id || null,
        name: program.name,
        billingType: program.billing_type,
        priceCents: paymentIntent.amount || price.unit_amount,
        originalPriceCents: price.unit_amount,
        currency: String(price.currency || program.currency || "EUR").toUpperCase()
      }
    });
  } catch (error) {
    return json(500, { error: normalizeStripeError(error) });
  }
};