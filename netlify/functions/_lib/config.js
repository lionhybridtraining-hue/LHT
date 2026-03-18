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
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    siteUrl: process.env.SITE_URL || "https://lionhybridtraining.com",
    metaWebhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || "",
    metaAppSecret: process.env.META_APP_SECRET || "",
    metaPageAccessToken: process.env.META_PAGE_ACCESS_TOKEN || ""
  };
}

module.exports = {
  getConfig
};
