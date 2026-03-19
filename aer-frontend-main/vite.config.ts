import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const rawBasePath = process.env.VITE_ASSET_BASE_PATH || env.VITE_ASSET_BASE_PATH || "/";
  const normalizedBasePath = rawBasePath.endsWith("/")
    ? rawBasePath
    : `${rawBasePath}/`;

  return {
    base: normalizedBasePath,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
