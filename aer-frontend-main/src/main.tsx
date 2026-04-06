import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/600.css";
import "@fontsource/oswald/700.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { loadRuntimePublicConfig } from "./lib/public-config";
import { getAccessToken } from "./lib/supabase";
import { mergeOnboardingAnswers } from "./lib/onboarding-intake";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const routerBasename = window.location.pathname.startsWith("/atleta")
  ? "/"
  : (import.meta.env.VITE_ROUTER_BASENAME || "/");

async function bootstrap() {
  await loadRuntimePublicConfig();
  const { default: App } = await import("./App.tsx");

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter basename={routerBasename}>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
}

bootstrap();

async function syncPwaSignal(partial: Record<string, unknown>) {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return;

    await mergeOnboardingAnswers(accessToken, {
      pwa: partial,
    });
  } catch (error) {
    console.warn("Não foi possível sincronizar evento PWA:", error);
  }
}

// Register service worker for PWA
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/planocorrida/sw.js", { scope: "/planocorrida/" });
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    (window as any).__LHT_DEFERRED_INSTALL_PROMPT__ = event as BeforeInstallPromptEvent;

    const promptedAt = new Date().toISOString();
    void syncPwaSignal({ installPromptedAt: promptedAt });
  });

  window.addEventListener("appinstalled", () => {
    const installedAt = new Date().toISOString();
    void syncPwaSignal({ installedAt });
  });
}
