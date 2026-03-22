function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getConfig() {
  return {
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    siteUrl: process.env.SITE_URL || "https://lionhybridtraining.com",
    defaultOnboardingProgramId: process.env.DEFAULT_ONBOARDING_PROGRAM_ID || "",
    defaultOnboardingProgramExternalId: process.env.DEFAULT_ONBOARDING_PROGRAM_EXTERNAL_ID || "AER",
    metaWebhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || "",
    metaAppSecret: process.env.META_APP_SECRET || "",
    metaPageAccessToken: process.env.META_PAGE_ACCESS_TOKEN || ""
  };
}

module.exports = {
  getConfig
};
