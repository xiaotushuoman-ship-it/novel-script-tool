import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";

const TIMEAI_BASE_URL = "https://timeai.chat";

function timeAiLocalProxy(): Plugin {
  return {
    name: "timeai-local-proxy",
    configureServer(server) {
      server.middlewares.use("/api/timeai", async (request, response) => {
        await forwardLocalTimeAiRequest(request, response);
      });
    },
  };
}

async function forwardLocalTimeAiRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    response.end();
    return;
  }

  const targetUrl = buildLocalTimeAiTargetUrl(request.url || "");
  const authorization = request.headers.authorization;

  try {
    const body = await readRequestBody(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
    const upstream = await fetchWithTimeoutCleanup(
      targetUrl,
      {
        method: request.method,
        headers: {
          "Content-Type": String(request.headers["content-type"] || "application/json"),
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: request.method === "GET" || request.method === "HEAD" ? undefined : body || "{}",
        signal: controller.signal,
      },
      timeout,
    );

    response.statusCode = upstream.status;
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("X-Accel-Buffering", "no");
    await pipeWebStreamToNodeResponse(upstream, response);
  } catch (error) {
    response.statusCode = 502;
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        error: {
          message: error instanceof Error ? error.message : "TimeAI local proxy request failed",
        },
      }),
    );
  }
}

async function pipeWebStreamToNodeResponse(upstream: Response, response: ServerResponse) {
  if (!upstream.body) {
    response.end(await upstream.text());
    return;
  }

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        response.write(Buffer.from(value));
      }
    }
  } finally {
    response.end();
    reader.releaseLock();
  }
}

async function fetchWithTimeoutCleanup(url: string, init: RequestInit, timeout: ReturnType<typeof setTimeout>) {
  try {
    return await fetch(url, init);
  } finally {
    clearTimeout(timeout);
  }
}

function buildLocalTimeAiTargetUrl(localUrl: string) {
  const [path = "", query = ""] = localUrl.split("?");
  const normalizedPath = path.replace(/^\/+/, "");
  return `${TIMEAI_BASE_URL}/${normalizedPath}${query ? `?${query}` : ""}`;
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export default defineConfig({
  plugins: [timeAiLocalProxy(), react()],
  server: {
    watch: {
      ignored: ["**/fix-storyboard.js"],
    },
    proxy: {
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
