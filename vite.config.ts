import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/timeai": {
        target: "https://timeai.chat",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/timeai/, ""),
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
