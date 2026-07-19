import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TIMEAI_BASE_URL = "https://timeai.chat";
const AISTARSLAB_BASE_URL = "https://api.video.aistarslab.com";
const ZZDH_BASE_URL = "http://127.0.0.1:8766";
const REQUEST_TIMEOUT_MS = 420_000;
export const DEFAULT_DESKTOP_PORT = 47831;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function buildTimeAiTargetUrl(requestUrl) {
  return buildTargetUrl(requestUrl, "/api/timeai", TIMEAI_BASE_URL);
}

export function buildAistarsLabTargetUrl(requestUrl) {
  return buildTargetUrl(requestUrl, "/api/aistarslab", AISTARSLAB_BASE_URL);
}

export function buildZzdhTargetUrl(requestUrl) {
  return buildTargetUrl(requestUrl, "/api/zzdh", ZZDH_BASE_URL);
}

export async function startDesktopServer({
  distDir,
  fetchImpl = fetch,
  host = "127.0.0.1",
  port = DEFAULT_DESKTOP_PORT,
}) {
  const resolvedDistDir = path.resolve(distDir);
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = request.url || "/";
      if (requestUrl.startsWith("/api/timeai")) {
        await forwardRequest(request, response, buildTimeAiTargetUrl(requestUrl), fetchImpl, { streamPreamble: true });
        return;
      }
      if (requestUrl.startsWith("/api/aistarslab-upload")) {
        await forwardAistarsLabUpload(request, response, fetchImpl);
        return;
      }
      if (requestUrl.startsWith("/api/aistarslab")) {
        await forwardRequest(request, response, buildAistarsLabTargetUrl(requestUrl), fetchImpl);
        return;
      }
      if (requestUrl.startsWith("/api/zzdh")) {
        await forwardRequest(request, response, buildZzdhTargetUrl(requestUrl), fetchImpl);
        return;
      }
      await serveStaticFile(requestUrl, response, resolvedDistDir);
    } catch (error) {
      sendJson(response, 500, { error: { message: getErrorMessage(error, "Desktop server request failed") } });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Desktop server did not expose a TCP port");
  server.unref?.();

  let closed = false;

  return {
    url: `http://${host}:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        if (closed) {
          resolve();
          return;
        }
        closed = true;
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function forwardRequest(request, response, targetUrl, fetchImpl, options = {}) {
  if (request.method === "OPTIONS") {
    writeCorsHeaders(response);
    response.writeHead(204);
    response.end();
    return;
  }

  const body = await readRequestBody(request);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  timeout.unref?.();
  try {
    const upstream = await fetchImpl(targetUrl, {
      method: request.method,
      headers: buildUpstreamHeaders(request.headers),
      body: request.method === "GET" || request.method === "HEAD" ? undefined : body,
      signal: controller.signal,
    });
    await pipeUpstreamResponse(upstream, response, options);
  } catch (error) {
    sendJson(response, 502, { error: { message: getErrorMessage(error, "Local proxy request failed") } });
  } finally {
    clearTimeout(timeout);
  }
}

async function forwardAistarsLabUpload(request, response, fetchImpl) {
  if (request.method === "OPTIONS") {
    writeCorsHeaders(response);
    response.writeHead(204);
    response.end();
    return;
  }

  const authorization = request.headers.authorization;
  if (!authorization) {
    sendJson(response, 400, { error: { message: "Missing Authorization header" } });
    return;
  }

  try {
    const rawBody = await readRequestBody(request);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const fileBuffer = Buffer.from(String(body.base64 || ""), "base64");
    const presign = await aistarsLabPost(
      "/openapi/uploads/presign",
      { filename: body.filename, contentType: body.contentType, size: body.size },
      authorization,
      fetchImpl,
    );
    const uploadResponse = await fetchImpl(presign.uploadUrl, {
      method: presign.method || "PUT",
      headers: presign.headers || {},
      body: fileBuffer,
    });
    if (!uploadResponse.ok) throw new Error(`Object storage upload failed: HTTP ${uploadResponse.status}`);

    const completed = await aistarsLabPost(
      "/openapi/uploads/complete",
      { fileKey: presign.fileKey },
      authorization,
      fetchImpl,
    );
    sendJson(response, 200, { code: 0, msg: "success", data: completed });
  } catch (error) {
    sendJson(response, 502, { error: { message: getErrorMessage(error, "AIStartLab local upload failed") } });
  }
}

async function aistarsLabPost(apiPath, body, authorization, fetchImpl) {
  const upstream = await fetchImpl(`${AISTARSLAB_BASE_URL}${apiPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authorization },
    body: JSON.stringify(body),
  });
  const text = await upstream.text();
  const json = text ? JSON.parse(text) : {};
  if (!upstream.ok) throw new Error(`HTTP ${upstream.status}: ${json?.error?.message || json?.msg || text}`);
  if (json.code !== 0) throw new Error(json.msg || `AIStartLab upload API failed: ${json.code}`);
  return json.data;
}

async function pipeUpstreamResponse(upstream, response, { streamPreamble = false } = {}) {
  response.statusCode = upstream.status;
  const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", "no-cache, no-transform");
  writeCorsHeaders(response);

  const isStreaming = /text\/event-stream|application\/x-ndjson/i.test(contentType);
  if (isStreaming) {
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();
    if (streamPreamble) response.write(": stream-open\n\n");
  }

  if (!upstream.body) {
    response.end(await upstream.text());
    return;
  }
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) response.write(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
    response.end();
  }
}

async function serveStaticFile(requestUrl, response, distDir) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let filePath = path.resolve(distDir, relativePath);
  if (!isInsideDirectory(filePath, distDir) || !(await fileExists(filePath))) {
    filePath = path.join(distDir, "index.html");
  }

  if (!(await fileExists(filePath))) {
    sendJson(response, 404, { error: { message: "Desktop application files are missing" } });
    return;
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  response.setHeader("Cache-Control", path.basename(filePath) === "index.html" ? "no-cache" : "public, max-age=31536000, immutable");
  createReadStream(filePath).pipe(response);
}

function buildTargetUrl(requestUrl, prefix, baseUrl) {
  const parsed = new URL(requestUrl, "http://localhost");
  const upstreamPath = parsed.pathname.slice(prefix.length).replace(/^\/+/, "");
  return `${baseUrl}/${upstreamPath}${parsed.search}`;
}

function buildUpstreamHeaders(headers) {
  const result = {};
  for (const name of ["accept", "authorization", "content-type"]) {
    const value = headers[name];
    if (typeof value === "string" && !isServerProxyAuthorization(name, value)) result[name] = value;
  }
  return result;
}

function isServerProxyAuthorization(name, value) {
  return name === "authorization" && /^Bearer\s+server-proxy$/i.test(value.trim());
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function writeCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(response, status, payload) {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  writeCorsHeaders(response);
  response.end(JSON.stringify(payload));
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isInsideDirectory(filePath, directory) {
  const relative = path.relative(directory, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function getErrorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const distDir = path.resolve(process.argv[2] || "dist");
  const server = await startDesktopServer({ distDir, port: Number(process.env.PORT || 4173) });
  process.stdout.write(`${server.url}\n`);
}
