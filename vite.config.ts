import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";

const TIMEAI_BASE_URL = "https://timeai.chat";
const AISTARSLAB_BASE_URL = "https://api.video.aistarslab.com";

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

function aistarsLabLocalProxy(): Plugin {
  return {
    name: "aistarslab-local-proxy",
    configureServer(server) {
      server.middlewares.use("/api/aistarslab-upload", async (request, response) => {
        await forwardLocalAistarsLabUploadRequest(request, response);
      });
      server.middlewares.use("/api/aistarslab", async (request, response) => {
        await forwardLocalAistarsLabRequest(request, response);
      });
    },
  };
}

export async function forwardLocalTimeAiRequest(request: IncomingMessage, response: ServerResponse) {
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
    const timeout = setTimeout(() => controller.abort(), 420000);
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

    const contentType = upstream.headers.get("content-type") || "application/json";
    const isStreamingResponse = /text\/event-stream|application\/x-ndjson/i.test(contentType);
    response.statusCode = upstream.status;
    response.setHeader("Content-Type", contentType);
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("X-Accel-Buffering", "no");
    if (isStreamingResponse) {
      response.setHeader("Connection", "keep-alive");
      response.flushHeaders?.();
      response.write(": stream-open\n\n");
      response.flush?.();
    }
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

async function forwardLocalAistarsLabRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    response.end();
    return;
  }

  const targetUrl = buildLocalAistarsLabTargetUrl(request.url || "");
  const authorization = request.headers.authorization;

  try {
    const body = await readRequestBody(request);
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "Content-Type": String(request.headers["content-type"] || "application/json"),
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: request.method === "GET" || request.method === "HEAD" ? undefined : body || "{}",
    });

    response.statusCode = upstream.status;
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    await pipeWebStreamToNodeResponse(upstream, response);
  } catch (error) {
    response.statusCode = 502;
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        error: {
          message: error instanceof Error ? error.message : "AIStartLab local proxy request failed",
        },
      }),
    );
  }
}

async function forwardLocalAistarsLabUploadRequest(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    response.end();
    return;
  }

  const authorization = request.headers.authorization;
  if (!authorization) {
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: { message: "Missing Authorization header" } }));
    return;
  }

  try {
    const rawBody = await readRequestBody(request);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const fileBuffer = Buffer.from(String(body.base64 || ""), "base64");
    const presign = await localAistarsLabPost("/openapi/uploads/presign", {
      filename: body.filename,
      contentType: body.contentType,
      size: body.size,
    }, authorization);

    const uploadResponse = await fetch(presign.uploadUrl, {
      method: presign.method || "PUT",
      headers: presign.headers || {},
      body: fileBuffer,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Object storage upload failed: HTTP ${uploadResponse.status}`);
    }

    const completed = await localAistarsLabPost("/openapi/uploads/complete", { fileKey: presign.fileKey }, authorization);
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ code: 0, msg: "success", data: completed }));
  } catch (error) {
    response.statusCode = 502;
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        error: {
          message: error instanceof Error ? error.message : "AIStartLab local upload failed",
        },
      }),
    );
  }
}

async function localAistarsLabPost(path: string, body: unknown, authorization: string) {
  const upstream = await fetch(`${AISTARSLAB_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body: JSON.stringify(body),
  });
  const text = await upstream.text();
  const json = text ? JSON.parse(text) : {};
  if (!upstream.ok) throw new Error(`HTTP ${upstream.status}: ${json?.error?.message || json?.msg || text}`);
  if (json.code !== 0) throw new Error(json.msg || `AIStartLab upload API failed: ${json.code}`);
  return json.data;
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
        response.flush?.();
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

function buildLocalAistarsLabTargetUrl(localUrl: string) {
  const [path = "", query = ""] = localUrl.split("?");
  const normalizedPath = path.replace(/^\/+/, "");
  return `${AISTARSLAB_BASE_URL}/${normalizedPath}${query ? `?${query}` : ""}`;
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
  plugins: [timeAiLocalProxy(), aistarsLabLocalProxy(), react()],
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
