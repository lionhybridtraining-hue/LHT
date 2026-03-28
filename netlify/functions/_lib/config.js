const FALLBACK_SUPABASE_URL = "https://rlivxjarqpqmvjtgmxhh.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsaXZ4amFycXBxbXZqdGdteGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDk3NzcsImV4cCI6MjA4OTE4NTc3N30.MHwkQnytSCOBleYVOF5hJHWiV8d_-2V9UGIqsLTgjIY";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getConfig() {
  return {
    supabaseUrl: process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY,
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
    metaPageAccessToken: process.env.META_PAGE_ACCESS_TOKEN || "",
    metaCapiAccessToken: process.env.META_CAPI_ACCESS_TOKEN || "",
    metaDatasetId: process.env.META_DATASET_ID || "",
    resendApiKey: process.env.RESEND_API_KEY || "",
    emailFrom: process.env.EMAIL_FROM || "Lion Hybrid Training <noreply@lionhybridtraining.com>"
  };
}

module.exports = {
  getConfig
};
