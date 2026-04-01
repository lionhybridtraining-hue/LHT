type RuntimePublicConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  authMaxSessionSeconds?: number;
};

declare global {
  interface Window {
    __LHT_PUBLIC_CONFIG__?: RuntimePublicConfig;
  }
}

function setRuntimeConfig(config: RuntimePublicConfig) {
  if (typeof window === "undefined") return;
  window.__LHT_PUBLIC_CONFIG__ = {
    ...(window.__LHT_PUBLIC_CONFIG__ || {}),
    ...config,
  };
}

export async function loadRuntimePublicConfig() {
  if (typeof window === "undefined") return;
  if (window.__LHT_PUBLIC_CONFIG__?.supabaseUrl && window.__LHT_PUBLIC_CONFIG__?.supabaseAnonKey) {
    return;
  }

  try {
    const response = await fetch("/.netlify/functions/public-config", {
      method: "GET",
      credentials: "same-origin",
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      authMaxSessionSeconds?: number;
    };

    setRuntimeConfig({
      supabaseUrl: payload.supabaseUrl,
      supabaseAnonKey: payload.supabaseAnonKey,
      authMaxSessionSeconds: Number(payload.authMaxSessionSeconds || 0) || undefined,
    });
  } catch {
    // Keep silent and let VITE_* fallback handle local/dev scenarios.
  }
}

export function getRuntimePublicConfig() {
  if (typeof window === "undefined") return undefined;
  return window.__LHT_PUBLIC_CONFIG__;
}
