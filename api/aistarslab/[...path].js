const AISTARSLAB_BASE_URL = "https://api.video.aistarslab.com";

export function buildAistarsLabTargetUrl(path, query = {}) {
  const rawPath = Array.isArray(path) ? path.join("/") : String(path || "");
  const normalizedPath = rawPath
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part).replace(/%3A/gi, ":"))
    .join("/");
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (key === "path" || value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      searchParams.append(key, String(item));
    }
  }
  const queryString = searchParams.toString();
  return `${AISTARSLAB_BASE_URL}/${normalizedPath}${queryString ? `?${queryString}` : ""}`;
}

export async function forwardAistarsLabRequest(request, response, path = request.query.path) {
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.status(204).end();
    return;
  }

  const authorizationHeader = request.headers.authorization || request.headers.Authorization;
  const bearerKey =
    typeof authorizationHeader === "string" && authorizationHeader.toLowerCase().startsWith("bearer ")
      ? authorizationHeader.slice(7).trim()
      : "";
  const apiKey = bearerKey || process.env.AISTARSLAB_API_KEY;
  if (!apiKey) {
    response.status(500).json({ error: { message: "Server missing AISTARSLAB_API_KEY" } });
    return;
  }

  const targetUrl = buildAistarsLabTargetUrl(path, request.query);

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "Content-Type": request.headers["content-type"] || "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: request.method === "GET" || request.method === "HEAD" ? undefined : JSON.stringify(request.body ?? {}),
    });

    const contentType = upstream.headers.get("content-type") || "application/json";
    response.status(upstream.status);
    response.setHeader("Content-Type", contentType);
    response.setHeader("Cache-Control", "no-cache, no-transform");

    const text = await upstream.text();
    response.send(text);
  } catch (error) {
    response.status(502).json({
      error: {
        message: error instanceof Error ? error.message : "AIStartLab proxy request failed",
      },
    });
  }
}

export default async function handler(request, response) {
  await forwardAistarsLabRequest(request, response);
}
