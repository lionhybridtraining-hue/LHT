const { json } = require("./_lib/http");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { error: "Missing Supabase public configuration" });
  }

  return json(200, {
    supabaseUrl,
    supabaseAnonKey,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    authMaxSessionSeconds: Number(process.env.AUTH_MAX_SESSION_SECONDS || 24 * 60 * 60)
  });
};