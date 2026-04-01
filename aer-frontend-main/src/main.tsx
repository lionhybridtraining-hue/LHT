import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { loadRuntimePublicConfig } from "./lib/public-config";

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

// Register service worker for PWA
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/planocorrida/sw.js", { scope: "/planocorrida/" });
  });
}
