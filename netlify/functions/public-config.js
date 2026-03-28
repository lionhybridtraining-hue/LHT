const { json } = require("./_lib/http");

const FALLBACK_SUPABASE_URL = "https://rlivxjarqpqmvjtgmxhh.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsaXZ4amFycXBxbXZqdGdteGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDk3NzcsImV4cCI6MjA4OTE4NTc3N30.MHwkQnytSCOBleYVOF5hJHWiV8d_-2V9UGIqsLTgjIY";

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return json(500, { error: "Missing Supabase public configuration" });
  }

  return json(200, {
    supabaseUrl,
    supabaseAnonKey,
    authMaxSessionSeconds: Number(process.env.AUTH_MAX_SESSION_SECONDS || 24 * 60 * 60)
  });
};