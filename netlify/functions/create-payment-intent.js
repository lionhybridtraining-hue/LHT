const { parseJsonBody, json } = require("./_lib/http");
const { getConfig } = require("./_lib/config");
const { requireAuthenticatedUser } = require("./_lib/authz");
const { resolveProgram } = require("./_lib/program-access");
const { getStripeClient, normalizeStripeError } = require("./_lib/stripe");
const { createStripePurchase, getAthleteByIdentity, upsertAthleteByIdentity, getActiveLikeProgramAssignment, createProgramAssignment, getCoachByIdentityId, setAthleteCoachIdentity, listStrengthPlans, getStrengthInstanceByStripePurchaseId, createStrengthPlanInstance, getStrengthPlanFull } = require("./_lib/supabase");
const { sendCAPIEvent, buildUserData } = require("./_lib/meta-capi");

function getCookieValue(cookies, key) {
  if (!cookies || !key) return "";
  const pattern = new RegExp(`(?:^|;\\s*)${key}=([^;]+)`);
  const match = cookies.match(pattern);
  return match ? match[1] : "";
}

async function getOrCreateCustomer(stripe, { email, name, identityId }) {
  if (!email) {
    return stripe.customers.create({
      ...(name ? { name } : {}),
      metadata: identityId ? { identity_id: identityId } : {}
    });
  }

  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing && Array.isArray(existing.data) && existing.data[0]) {
    const cust = existing.data[0];
    // Update name if we have it and customer doesn't
    if (name && !cust.name) {
      await stripe.customers.update(cust.id, { name });
      cust.name = name;
    }
    return cust;
  }

  return stripe.customers.create({
    email,
    ...(name ? { name } : {}),
    metadata: identityId ? { identity_id: identityId } : {}
  });
}

async function resolvePromotionCode(stripe, code) {
  if (!code || typeof code !== "string") return null;
  const sanitized = code.trim().toUpperCase().slice(0, 100);
  if (!sanitized) return null;
  const list = await stripe.promotionCodes.list({ code: sanitized, active: true, limit: 1, expand: ["data.promotion.coupon"] });
  if (!list || !Array.isArray(list.data) || !list.data[0]) return null;
  const promo = list.data[0];
  if (!promo.promotion || promo.promotion.type !== "coupon") return null;
  const coupon = promo.promotion.coupon;
  if (!coupon || typeof coupon === "string" || !coupon.valid) return null;
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

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.floor(parsed);
  return intValue > 0 ? intValue : fallback;
}

function resolvePhasedConfig(body, totalAmountCents) {
  const phasedBody = body && typeof body.phasedPlan === "object" ? body.phasedPlan : {};
  const totalInstallments = parsePositiveInt(
    phasedBody.totalInstallments != null ? phasedBody.totalInstallments : body.phased_total_installments,
    parsePositiveInt(process.env.PHASED_DEFAULT_INSTALLMENTS, 3)
  );
  const frequencyRaw = (phasedBody.frequency || body.phased_frequency || process.env.PHASED_DEFAULT_FREQUENCY || "monthly")
    .toString()
    .trim()
    .toLowerCase();
  const frequency = ["weekly", "biweekly", "monthly"].includes(frequencyRaw)
    ? frequencyRaw
    : "monthly";
  const gracePeriodDays = parsePositiveInt(
    phasedBody.gracePeriodDays != null ? phasedBody.gracePeriodDays : body.phased_grace_period_days,
    parsePositiveInt(process.env.PHASED_DEFAULT_GRACE_DAYS, 7)
  );
  const maxRetryAttempts = parsePositiveInt(
    phasedBody.maxRetryAttempts != null ? phasedBody.maxRetryAttempts : body.phased_max_retry_attempts,
    parsePositiveInt(process.env.PHASED_DEFAULT_MAX_RETRIES, 3)
  );

  const normalizedInstallments = Math.max(2, totalInstallments);
  const firstInstallmentAmount = Math.ceil(totalAmountCents / normalizedInstallments);

  return {
    totalAmountCents,
    totalInstallments: normalizedInstallments,
    firstInstallmentAmount,
    frequency,
    gracePeriodDays,
    maxRetryAttempts
  };
}

async function ensureZeroCouponProvisioning(config, { identityId, email, program, purchase }) {
  try {
    // 1. Ensure athlete exists
    let athlete = await getAthleteByIdentity(config, identityId);
    if (!athlete && email) {
      athlete = await upsertAthleteByIdentity(config, { identityId, email, name: email });
    }
    if (!athlete) return;

    // 2. Create program assignment if none exists
    const existing = await getActiveLikeProgramAssignment(config, athlete.id, program.id);
    let assignmentId = existing ? existing.id : null;
    if (!existing) {
      const defaultCoachIdentityId = program.default_coach_identity_id || null;
      let coachId = null;
      if (defaultCoachIdentityId) {
        try {
          const coach = await getCoachByIdentityId(config, defaultCoachIdentityId);
          coachId = coach ? coach.id : null;
        } catch (_) { /* non-fatal */ }
        if (athlete.coach_identity_id !== defaultCoachIdentityId) {
          try { await setAthleteCoachIdentity(config, athlete.id, defaultCoachIdentityId); } catch (_) { /* non-fatal */ }
        }
      }
      const assignment = await createProgramAssignment(config, {
        athlete_id: athlete.id,
        coach_id: coachId,
        training_program_id: program.id,
        start_date: new Date().toISOString().slice(0, 10),
        duration_weeks: program.duration_weeks || 12,
        status: "active",
        price_cents_snapshot: 0,
        currency_snapshot: program.currency || "EUR",
        followup_type_snapshot: "standard",
        notes: `Auto-created from zero-coupon purchase ${purchase.id}`
      });
      assignmentId = assignment ? assignment.id : null;
    }

    // 3. Create strength instance if template exists
    const existingInstance = await getStrengthInstanceByStripePurchaseId(config, purchase.id);
    if (existingInstance) return;

    const plans = await listStrengthPlans(config, { trainingProgramId: program.id });
    const template = Array.isArray(plans) ? (plans.find((p) => p.status === "active") || plans[0] || null) : null;
    if (!template) return;

    let planSnapshot = null;
    try {
      const full = await getStrengthPlanFull(config, template.id);
      if (full) planSnapshot = { exercises: full.exercises, prescriptions: full.prescriptions, phaseNotes: full.phaseNotes || [] };
    } catch (_) { /* non-fatal */ }

    await createStrengthPlanInstance(config, {
      plan_id: template.id,
      athlete_id: athlete.id,
      start_date: null,
      load_round: 2.5,
      status: "active",
      assigned_by: identityId,
      access_model: program.access_model || null,
      stripe_purchase_id: purchase.id,
      program_assignment_id: assignmentId,
      coach_locked_until: null,
      plan_snapshot: planSnapshot ? JSON.stringify(planSnapshot) : null
    });
  } catch (err) {
    console.error("ensureZeroCouponProvisioning failed:", err.message || err);
  }
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
    const paymentModel = (program.payment_model || "single").toString().trim().toLowerCase();
    const isPhasedPayment = paymentModel === "phased" && program.billing_type !== "recurring";
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
      payment_model: paymentModel,
      billing_interval: resolvedBillingInterval,
      email: auth.user.email || "",
      event_source_url: body.event_source_url || "",
      fbp,
      fbc
    };

    let paymentIntent = null;
    let setupIntent = null;
    let subscriptionId = null;
    let clientSecret = "";
    let intentType = "payment";

    if (program.billing_type === "recurring") {
      const customer = await getOrCreateCustomer(stripe, {
        email: auth.user.email || "",
        name: auth.user.name || "",
        identityId: auth.user.sub
      });

      const subParams = {
        customer: customer.id,
        items: [{ price: priceId }],
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription"
        },
        metadata,
        expand: ["latest_invoice.payment_intent", "latest_invoice.confirmation_secret", "pending_setup_intent"]
      };

      if (promo && promo.promotion && promo.promotion.type === "coupon") {
        const subscriptionCoupon = promo.promotion.coupon;
        if (subscriptionCoupon && typeof subscriptionCoupon !== "string") {
          subParams.coupon = subscriptionCoupon.id;
        }
      }

      const subscription = await stripe.subscriptions.create(subParams);
      const latestInvoice = subscription && subscription.latest_invoice && typeof subscription.latest_invoice === "object"
        ? subscription.latest_invoice
        : null;

      subscriptionId = subscription.id;
      paymentIntent = latestInvoice && latestInvoice.payment_intent
        ? latestInvoice.payment_intent
        : null;
      setupIntent = subscription && subscription.pending_setup_intent
        ? subscription.pending_setup_intent
        : null;

      if (typeof paymentIntent === "string") {
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent);
      }

      if (paymentIntent && paymentIntent.client_secret) {
        clientSecret = paymentIntent.client_secret;
      } else if (latestInvoice && latestInvoice.confirmation_secret && latestInvoice.confirmation_secret.client_secret) {
        clientSecret = latestInvoice.confirmation_secret.client_secret;
      } else if (setupIntent) {
        if (typeof setupIntent === "string") {
          setupIntent = await stripe.setupIntents.retrieve(setupIntent);
        }
        if (setupIntent && setupIntent.client_secret) {
          clientSecret = setupIntent.client_secret;
          intentType = "setup";
        }
      }

      if (!clientSecret) {
        console.error("create-payment-intent: subscription created without client secret", {
          subscriptionId,
          hasLatestInvoice: Boolean(latestInvoice),
          hasPaymentIntent: Boolean(paymentIntent),
          hasConfirmationSecret: Boolean(latestInvoice && latestInvoice.confirmation_secret && latestInvoice.confirmation_secret.client_secret),
          hasPendingSetupIntent: Boolean(setupIntent)
        });
        return json(500, { error: "Nao foi possivel iniciar o pagamento da subscricao" });
      }

      if (paymentIntent && paymentIntent.id) {
        await stripe.paymentIntents.update(paymentIntent.id, {
          metadata: {
            ...metadata,
            subscription_id: subscriptionId
          }
        });
      }
    } else {
      // Create/resolve Stripe Customer for one-time payments too
      const customer = await getOrCreateCustomer(stripe, {
        email: auth.user.email || "",
        name: auth.user.name || "",
        identityId: auth.user.sub
      });

      const piParams = {
        amount: price.unit_amount,
        currency: price.currency,
        customer: customer.id,
        metadata,
        receipt_email: auth.user.email || undefined,
        automatic_payment_methods: { enabled: true }
      };

      // Apply coupon discount to one-time payment
      if (promo && promo.promotion && promo.promotion.type === "coupon") {
        const coupon = promo.promotion.coupon;
        if (!coupon || typeof coupon === "string") {
          throw new Error("Codigo de desconto invalido ou expirado");
        }
        if (coupon.amount_off && Number.isFinite(coupon.amount_off)) {
          piParams.amount = Math.max(0, piParams.amount - coupon.amount_off);
        } else if (coupon.percent_off && Number.isFinite(coupon.percent_off)) {
          piParams.amount = Math.max(0, Math.round(piParams.amount * (1 - coupon.percent_off / 100)));
        }
        piParams.metadata.coupon_code = couponCode;
        piParams.metadata.coupon_id = coupon.id;
      }

      let phasedConfig = null;
      if (isPhasedPayment) {
        phasedConfig = resolvePhasedConfig(body, piParams.amount);
        piParams.amount = phasedConfig.firstInstallmentAmount;
        piParams.metadata.phased_total_amount_cents = String(phasedConfig.totalAmountCents);
        piParams.metadata.phased_total_installments = String(phasedConfig.totalInstallments);
        piParams.metadata.phased_frequency = phasedConfig.frequency;
        piParams.metadata.phased_grace_period_days = String(phasedConfig.gracePeriodDays);
        piParams.metadata.phased_max_retry_attempts = String(phasedConfig.maxRetryAttempts);
        piParams.metadata.phased_first_charge_cents = String(phasedConfig.firstInstallmentAmount);
      }

      // Stripe does not allow creating PaymentIntents with amount 0.
      // For 100% discounts we persist a paid purchase directly and let onboarding/check-access continue.
      if (piParams.amount <= 0) {
        const nowIso = new Date().toISOString();
        const purchase = await createStripePurchase(config, {
          stripe_session_id: null,
          stripe_customer_id: customer.id,
          stripe_payment_intent_id: null,
          stripe_subscription_id: null,
          identity_id: auth.user.sub,
          program_id: program.id,
          email: auth.user.email || null,
          customer_name: auth.user.name || null,
          amount_cents: 0,
          currency: String(price.currency || program.currency || "EUR").toUpperCase(),
          billing_type: program.billing_type || "one_time",
          status: "paid",
          source: "stripe_zero_coupon",
          paid_at: nowIso,
          expires_at: null
        });

        // Auto-provision assignment and strength instance (same as webhook flow)
        if (purchase && purchase.id) {
          await ensureZeroCouponProvisioning(config, {
            identityId: auth.user.sub,
            email: auth.user.email || null,
            program,
            purchase
          });
        }

        return json(200, {
          ok: true,
          noPaymentRequired: true,
          purchaseId: purchase && purchase.id ? purchase.id : null,
          redirectUrl: `${config.siteUrl}/onboarding?program_id=${encodeURIComponent(program.id)}`,
          program: {
            id: program.id,
            externalId: program.external_id || null,
            name: program.name,
            billingType: program.billing_type,
            paymentModel,
            priceCents: 0,
            originalPriceCents: price.unit_amount,
            currency: String(price.currency || program.currency || "EUR").toUpperCase()
          }
        });
      }

      paymentIntent = await stripe.paymentIntents.create(piParams, {
        idempotencyKey: `pi_${auth.user.sub}_${program.id}_${Date.now()}`
      });
      clientSecret = paymentIntent.client_secret || "";
    }

    if (!clientSecret && paymentIntent && paymentIntent.client_secret) {
      clientSecret = paymentIntent.client_secret;
    }

    if (config.metaCapiAccessToken && config.metaDatasetId) {
      try {
        await sendCAPIEvent(config, {
          event_name: "InitiateCheckout",
          event_time: Math.floor(Date.now() / 1000),
          event_id: paymentIntent && paymentIntent.id
            ? `checkout_pi_${paymentIntent.id}`
            : setupIntent && setupIntent.id
              ? `checkout_si_${setupIntent.id}`
              : `checkout_sub_${subscriptionId || program.id}`,
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
            value: ((paymentIntent && paymentIntent.amount) || price.unit_amount || 0) / 100,
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
      clientSecret,
      intentType,
      paymentIntentId: paymentIntent && paymentIntent.id ? paymentIntent.id : null,
      setupIntentId: setupIntent && setupIntent.id ? setupIntent.id : null,
      subscriptionId,
      program: {
        id: program.id,
        externalId: program.external_id || null,
        name: program.name,
        billingType: program.billing_type,
        paymentModel,
        priceCents: (paymentIntent && paymentIntent.amount) || price.unit_amount,
        originalPriceCents: price.unit_amount,
        currency: String(price.currency || program.currency || "EUR").toUpperCase()
      }
    });
  } catch (error) {
    console.error("create-payment-intent failed:", error);
    return json(500, { error: normalizeStripeError(error) });
  }
};