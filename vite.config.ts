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
        configure: (proxy) => {
          proxy.on("error", (_error, _request, response) => {
            if (!response.headersSent) {
              response.writeHead(502, { "Content-Type": "application/json" });
            }
            response.end(
              JSON.stringify({
                error: {
                  message: "TimeAI local proxy request failed",
                },
              }),
            );
          });
        },
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
