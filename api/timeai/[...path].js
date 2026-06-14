const TIMEAI_BASE_URL = "https://timeai.chat";

export function buildTimeAiTargetUrl(path) {
  const rawPath = Array.isArray(path) ? path.join("/") : String(path || "");
  const normalizedPath = rawPath
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part).replace(/%3A/gi, ":"))
    .join("/");
  return `${TIMEAI_BASE_URL}/${normalizedPath}`;
}

export async function forwardTimeAiRequest(request, response, path = request.query.path) {
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.status(204).end();
    return;
  }

  const authorizationHeader = request.headers.authorization || request.headers.Authorization;
  const bearerKey =
    typeof authorizationHeader === "string" && authorizationHeader.toLowerCase().startsWith("bearer ")
      ? authorizationHeader.slice(7).trim()
      : "";
  const apiKey = bearerKey || process.env.TIMEAI_API_KEY;
  if (!apiKey) {
    response.status(500).json({ error: { message: "Server missing TIMEAI_API_KEY" } });
    return;
  }

  const targetUrl = buildTimeAiTargetUrl(path);

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

    const body = await upstream.text();
    response.send(body);
  } catch (error) {
    response.status(502).json({
      error: {
        message: error instanceof Error ? error.message : "TimeAI proxy request failed",
      },
    });
  }
}

export default async function handler(request, response) {
  await forwardTimeAiRequest(request, response);
}
