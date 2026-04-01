function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function resolveStripePublishableKey() {
  return (
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.STRIPE_PUBLIC_KEY ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    ""
  );
}

function getConfig() {
  return {
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseAnonKey: requireEnv("SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripePublishableKey: resolveStripePublishableKey(),
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    siteUrl: process.env.SITE_URL || "https://lionhybridtraining.com",
    defaultOnboardingProgramId: process.env.DEFAULT_ONBOARDING_PROGRAM_ID || "",
    defaultOnboardingProgramExternalId: process.env.DEFAULT_ONBOARDING_PROGRAM_EXTERNAL_ID || "AER",
    metaWebhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || "",
    metaAppSecret: process.env.META_APP_SECRET || "",
    metaPageAccessToken: process.env.META_PAGE_ACCESS_TOKEN || "",
    metaCapiAccessToken: process.env.META_CAPI_ACCESS_TOKEN || "",
    metaDatasetId: process.env.META_DATASET_ID || "",
    resendApiKey: process.env.RESEND_API_KEY || "",
    emailFrom: process.env.EMAIL_FROM || "Lion Hybrid Training <noreply@lionhybridtraining.com>",
    stravaClientId: process.env.STRAVA_CLIENT_ID || "",
    stravaClientSecret: process.env.STRAVA_CLIENT_SECRET || "",
    stravaWebhookVerifyToken: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || "",
    stravaStateSecret: process.env.STRAVA_STATE_SECRET || ""
  };
}

module.exports = {
  getConfig
};
