const { json } = require("./_lib/http");

function resolveStripePublishableKey() {
  return (
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.STRIPE_PUBLIC_KEY ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    ""
  );
}

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
    stripePublishableKey: resolveStripePublishableKey(),
    authMaxSessionSeconds: Number(process.env.AUTH_MAX_SESSION_SECONDS || 24 * 60 * 60)
  });
};