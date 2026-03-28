import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";

function requireEnv(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY") {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value as string;
}

const MAX_SESSION_AGE_SECONDS = Number(import.meta.env.VITE_AUTH_MAX_SESSION_SECONDS || 24 * 60 * 60);

const supabaseUrl = requireEnv("VITE_SUPABASE_URL");
const supabaseAnonKey = requireEnv("VITE_SUPABASE_ANON_KEY");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function isSessionOverMaxAge(session: Session | null) {
  if (!session?.user) return false;
  const issuedAt = session.user.last_sign_in_at || session.user.created_at || null;
  if (!issuedAt) return false;
  const issuedMs = new Date(issuedAt).getTime();
  if (!Number.isFinite(issuedMs)) return false;
  const ageSeconds = Math.floor((Date.now() - issuedMs) / 1000);
  return ageSeconds > MAX_SESSION_AGE_SECONDS;
}

export async function enforceSessionMaxAge(session: Session | null) {
  if (isSessionOverMaxAge(session)) {
    await supabase.auth.signOut({ scope: "local" });
    return true;
  }
  return false;
}

export function buildAppRedirectUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // When serving from /atleta/* (clean URLs), don't apply the configured basename prefix
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/atleta")) {
    return `${window.location.origin}${normalizedPath}`;
  }
  const basename = import.meta.env.VITE_ROUTER_BASENAME || "/";
  const normalizedBase = basename === "/" ? "" : basename.replace(/\/$/, "");
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
  const expiredByPolicy = await enforceSessionMaxAge(session);
  if (expiredByPolicy) return "";
  return session?.access_token || "";
}