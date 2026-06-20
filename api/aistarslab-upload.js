const AISTARSLAB_OPENAPI_BASE_URL = "https://api.video.aistarslab.com/openapi";

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: { message: "Method not allowed" } });
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

  try {
    const { filename, contentType, size, base64 } = request.body ?? {};
    if (!filename || !contentType || !size || !base64) {
      response.status(400).json({ error: { message: "Missing filename, contentType, size or base64" } });
      return;
    }

    const fileBuffer = Buffer.from(String(base64), "base64");
    const presign = await openApiPost("/uploads/presign", { filename, contentType, size }, apiKey);
    const uploadResponse = await fetch(presign.uploadUrl, {
      method: presign.method || "PUT",
      headers: presign.headers || {},
      body: fileBuffer,
    });
    if (!uploadResponse.ok) {
      response.status(502).json({
        error: {
          message: `Object storage upload failed: HTTP ${uploadResponse.status}`,
          detail: await uploadResponse.text().catch(() => ""),
        },
      });
      return;
    }

    const completed = await openApiPost("/uploads/complete", { fileKey: presign.fileKey }, apiKey);
    response.status(200).json({ code: 0, msg: "success", data: completed });
  } catch (error) {
    response.status(502).json({
      error: {
        message: error instanceof Error ? error.message : "AIStartLab material upload failed",
      },
    });
  }
}

async function openApiPost(path, body, apiKey) {
  const upstream = await fetch(`${AISTARSLAB_OPENAPI_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await upstream.text();
  const json = text ? JSON.parse(text) : {};
  if (!upstream.ok) throw new Error(`HTTP ${upstream.status}: ${extractErrorMessage(json)}`);
  if (json.code !== 0) throw new Error(json.msg || `AIStartLab upload API failed: ${json.code}`);
  return json.data;
}

function extractErrorMessage(json) {
  return json?.error?.message || json?.msg || JSON.stringify(json);
}
