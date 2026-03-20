import { createClient } from "@supabase/supabase-js";

const FALLBACK_SUPABASE_URL = "https://rlivxjarqpqmvjtgmxhh.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsaXZ4amFycXBxbXZqdGdteGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDk3NzcsImV4cCI6MjA4OTE4NTc3N30.MHwkQnytSCOBleYVOF5hJHWiV8d_-2V9UGIqsLTgjIY";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function buildAppRedirectUrl(path: string) {
  const basename = import.meta.env.VITE_ROUTER_BASENAME || "/";
  const normalizedBase = basename === "/" ? "" : basename.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${normalizedBase}${normalizedPath}`;
}

export async function signInWithGoogle(path = "/formulario") {
  const redirectTo = buildAppRedirectUrl(path);
  const result = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

export async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || "";
}