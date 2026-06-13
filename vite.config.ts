import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: ["**/fix-storyboard.js"],
    },
    proxy: {
      "/api/timeai": {
        target: "https://timeai.chat",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/timeai/, ""),
      },
      "/api/zzdh": {
        target: "http://127.0.0.1:8766",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/zzdh/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/testSetup.ts"],
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
  },
});
