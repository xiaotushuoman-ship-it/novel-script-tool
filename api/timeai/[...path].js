const TIMEAI_BASE_URL = "https://timeai.chat";

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.status(204).end();
    return;
  }

  const apiKey = process.env.TIMEAI_API_KEY;
  if (!apiKey) {
    response.status(500).json({ error: { message: "Server missing TIMEAI_API_KEY" } });
    return;
  }

  const pathParts = Array.isArray(request.query.path) ? request.query.path : [request.query.path].filter(Boolean);
  const targetUrl = `${TIMEAI_BASE_URL}/${pathParts.map(encodeURIComponent).join("/")}`;

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
