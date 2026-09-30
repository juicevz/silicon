import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5286,
    proxy: {
      "/api": {
        target: process.env.SILICON_API_PROXY ?? "http://127.0.0.1:4286",
        changeOrigin: false,
      },
      "/health": {
        target: process.env.SILICON_API_PROXY ?? "http://127.0.0.1:4286",
        changeOrigin: false,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 750,
    // WebKit caches failed modulepreloads even across reloads. Native imports
    // let Reload Silicon recover after a lost connection (WebKit bug 270357).
    modulePreload: false,
  },
});
