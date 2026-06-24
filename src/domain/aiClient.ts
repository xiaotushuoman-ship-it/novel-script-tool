export type AiSettings = {
  endpoint: string;
  apiKey: string;
  apiKeySecondary?: string;
  apiKeySource?: "primary" | "secondary";
  modelApiKeySources?: Partial<Record<string, "primary" | "secondary">>;
  model: string;
  geminiImageEndpoint?: string;
  geminiImageApiKey?: string;
  geminiImageModel?: string;
};

const TIMEAI_ENDPOINT = "https://timeai.chat/v1";
const TIMEAI_PROXY_ENDPOINT = "/api/timeai/v1";

export async function callAi(
  settings: AiSettings,
  prompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!settings.endpoint.trim()) throw new Error("请填写 API 地址");
  const apiKey = resolveApiKey(settings);
  if (!apiKey.trim()) throw new Error("请填写 API Key");
  if (!settings.model.trim()) throw new Error("请填写模型名");
  const runtimeEndpoint = resolveRuntimeEndpoint(settings.endpoint);

  const response = await requestAi(
    () =>
      fetchImpl(resolveChatCompletionsEndpoint(runtimeEndpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [{ role: "user", content: prompt }],
        }),
      }),
    runtimeEndpoint,
  );

  if (!response.ok) {
    throw new Error(buildHttpErrorMessage("AI 调用", response.status));
  }

  const data = await response.json();
  const content = extractChatCompletionText(data);
  if (typeof content !== "string") throw new Error("AI 返回格式不正确");
  return content;
}

export async function callAiStream(
  settings: AiSettings,
  prompt: string,
  onChunk: (chunk: string) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!settings.endpoint.trim()) throw new Error("请填写 API 地址");
  const apiKey = resolveApiKey(settings);
  if (!apiKey.trim()) throw new Error("请填写 API Key");
  if (!settings.model.trim()) throw new Error("请填写模型名");
  const runtimeEndpoint = resolveRuntimeEndpoint(settings.endpoint);

  const response = await requestAi(
    () =>
      fetchImpl(resolveChatCompletionsEndpoint(runtimeEndpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        }),
      }),
    runtimeEndpoint,
  );

  if (!response.ok) {
    const fallbackContent = await callAi(settings, prompt, fetchImpl);
    onChunk(fallbackContent);
    return fallbackContent;
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    const data = await response.json();
    const content = extractChatCompletionText(data);
    if (typeof content !== "string") throw new Error("AI 返回格式不正确");
    onChunk(content);
    return content;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  const streamTimeoutMs = 30000;

  while (true) {
    const { done, value } = await readStreamChunkWithTimeout(reader, streamTimeoutMs);
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const delta = extractStreamingLineText(line);
      if (delta) {
        fullText += delta;
        onChunk(delta);
      }
    }
  }

  if (buffer.trim()) {
    for (const line of buffer.split(/\r?\n/)) {
      const delta = extractStreamingLineText(line);
      if (delta) {
        fullText += delta;
        onChunk(delta);
      }
    }
  }

  if (!fullText.trim()) throw new Error("AI 返回格式不正确");
  return fullText;
}

async function readStreamChunkWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("AI 流式响应超时")), timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === "AI 流式响应超时") {
      void reader.cancel?.().catch(() => undefined);
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function extractStreamingLineText(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) return null;
  const data = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
  if (!data || data === "[DONE]") return null;
  const parsed = safeJsonParse(data);
  return extractStreamingDeltaText(parsed);
}

export async function callImageGeneration(
  settings: AiSettings,
  prompt: string,
  imageModel: string,
  imageRatio = "16:9",
  imageResolution = "1K",
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!settings.endpoint.trim()) throw new Error("请填写 API 地址");
  const apiKey = resolveApiKey(settings);
  if (!apiKey.trim()) throw new Error("请填写 API Key");
  if (!imageModel.trim()) throw new Error("请选择生图模型");
  const runtimeEndpoint = resolveRuntimeEndpoint(settings.endpoint);
  const runtimeSettings = { ...settings, endpoint: runtimeEndpoint };

  if (isGeminiNativeEndpoint(runtimeEndpoint) && isGeminiImageModel(imageModel)) {
    return callGeminiImageGeneration(runtimeSettings, apiKey, prompt, imageModel, imageRatio, imageResolution, fetchImpl);
  }

  const response = await requestAi(
    () =>
      fetchImpl(resolveImageGenerationsEndpoint(runtimeEndpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: resolveImageModel(imageModel, imageResolution),
          prompt,
          size: resolveImageSize(imageRatio, imageResolution, imageModel),
          response_format: "url",
        }),
      }),
    runtimeEndpoint,
  );

  if (!response.ok) {
    if (isGeminiImageModel(imageModel) && !isGeminiNativeEndpoint(runtimeEndpoint)) {
      return callThirdPartyGeminiChatImageGeneration(
        runtimeSettings,
        apiKey,
        prompt,
        imageModel,
        imageRatio,
        imageResolution,
        fetchImpl,
      );
    }
    throw new Error(await buildHttpErrorMessageFromResponse("生图调用", response));
  }

  const data = await response.json();
  const images = extractImageGenerationImages(data);
  if (images.length === 0) throw new Error("生图返回格式不正确");

  return images.join("\n");
}

async function callThirdPartyGeminiChatImageGeneration(
  settings: AiSettings,
  apiKey: string,
  prompt: string,
  imageModel: string,
  imageRatio: string,
  imageResolution: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await requestAi(
    () =>
      fetchImpl(resolveChatCompletionsEndpoint(settings.endpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: imageModel,
          messages: [
            {
              role: "user",
              content: [
                `请根据以下内容生成图片。`,
                `画面比例：${normalizeImageRatio(imageRatio)}`,
                `清晰度：${imageResolution.trim().toUpperCase()}`,
                `请返回图片 URL 或 base64 图片数据，不要只返回文字描述。`,
                prompt,
              ].join("\n"),
            },
          ],
        }),
      }),
    settings.endpoint,
  );

  if (!response.ok) {
    return callThirdPartyGeminiGenerateContent(settings, apiKey, prompt, imageModel, imageRatio, imageResolution, fetchImpl);
  }

  const data = await response.json();
  const images = extractChatCompletionImages(data);
  if (images.length === 0) throw new Error("生图返回格式不正确");
  return images.join("\n");
}

async function callThirdPartyGeminiGenerateContent(
  settings: AiSettings,
  apiKey: string,
  prompt: string,
  imageModel: string,
  imageRatio: string,
  imageResolution: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await requestAi(
    () =>
      fetchImpl(resolveThirdPartyGeminiGenerateContentEndpoint(settings.endpoint, imageModel), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            responseFormat: {
              image: {
                aspectRatio: normalizeImageRatio(imageRatio),
                imageSize: resolveGeminiImageSize(imageResolution),
              },
            },
          },
        }),
      }),
    settings.endpoint,
  );

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessageFromResponse("生图调用", response));
  }

  const data = await response.json();
  const images = extractGeminiImages(data);
  if (images.length === 0) throw new Error("生图返回格式不正确");
  return images.join("\n");
}

async function callGeminiImageGeneration(
  settings: AiSettings,
  apiKey: string,
  prompt: string,
  imageModel: string,
  imageRatio: string,
  imageResolution: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await requestAi(
    () =>
      fetchImpl(resolveGeminiGenerateContentEndpoint(settings.endpoint, imageModel), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            responseFormat: {
              image: {
                aspectRatio: normalizeImageRatio(imageRatio),
                imageSize: resolveGeminiImageSize(imageResolution),
              },
            },
          },
        }),
      }),
    settings.endpoint,
  );

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessageFromResponse("生图调用", response));
  }

  const data = await response.json();
  const images = extractGeminiImages(data);
  if (images.length === 0) throw new Error("生图返回格式不正确");
  return images.join("\n");
}

function resolveImageModel(imageModel: string, imageResolution: string): string {
  const normalizedResolution = imageResolution.trim().toUpperCase();
  if (normalizedResolution === "2K" && imageModel.trim() === "gpt-image-1") return "gpt-image-2";
  return imageModel;
}

function resolveGeminiImageSize(imageResolution: string): string {
  const normalizedResolution = imageResolution.trim().toUpperCase();
  if (normalizedResolution === "4K") return "4K";
  if (normalizedResolution === "2K") return "2K";
  return "1K";
}

function resolveApiKey(settings: AiSettings): string {
  const model = settings.model.trim();
  const source = model ? settings.modelApiKeySources?.[model] ?? settings.apiKeySource ?? "primary" : "primary";
  if (source === "secondary") return settings.apiKeySecondary?.trim() || settings.apiKey.trim();
  return settings.apiKey.trim();
}

function resolveRuntimeEndpoint(endpoint: string): string {
  const normalizedEndpoint = endpoint.trim().replace(/\/+$/, "");
  if (normalizedEndpoint === TIMEAI_ENDPOINT) {
    return TIMEAI_PROXY_ENDPOINT;
  }
  return endpoint;
}

async function requestAi(fetcher: () => Promise<Response>, endpoint: string): Promise<Response> {
  try {
    return await fetcher();
  } catch (error) {
    if (isNetworkFetchError(error)) {
      throw new Error(buildNetworkErrorMessage(endpoint));
    }
    throw error;
  }
}

function isNetworkFetchError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  return /fetch|network|load failed|failed to fetch/i.test(error.message);
}

function buildNetworkErrorMessage(endpoint: string): string {
  const normalized = endpoint.trim();
  const isBrowserDirectRemote = /^https?:\/\//i.test(normalized);
  const suggestion = isBrowserDirectRemote
    ? "当前像是在浏览器里直连三方 API，可能被跨域 CORS 或网络策略拦截。请把 TimeAI 地址填写为 https://timeai.chat/v1，让软件自动走站内代理。"
    : "当前站内代理没有返回结果。请确认本地开发服务已重启，或稍后重试；网页端请等待 Vercel 部署完成后刷新页面。";
  return `AI 调用失败：网络请求未完成。${suggestion}`;
}

function buildHttpErrorMessage(operation: string, status: number): string {
  if (status === 429) {
    return `${operation}失败：HTTP 429。当前 API Key、模型分组或中转站触发限流/额度限制，请降低批量生图数量、稍等后重试，或切换更高额度的 API Key/模型分组。`;
  }
  if (status === 413) {
    return `${operation}失败：HTTP 413。请求内容过大，通常是图片 base64 或提示词太长导致中转站拒收；请不要把原图数据直接放进提示词，或改用更短提示词后重试。`;
  }
  if (status === 401 || status === 403) {
    return `${operation}失败：HTTP ${status}。请检查 API Key 是否有效、模型名是否与 API 分组对应。`;
  }
  if (status === 503 || status === 524) {
    return `${operation}失败：HTTP ${status}。中转站或模型当前响应超时/不可用，请稍后重试或切换模型。`;
  }
  if (status === 502) {
    return `${operation}失败：HTTP 502。本地/网页代理转发到中转站失败，通常是中转站连接被断开、模型响应过慢或请求过长。请稍后重试；如果只在第6项出现，请减少输入长度或切换文本模型。`;
  }
  return `${operation}失败：HTTP ${status}`;
}

async function buildHttpErrorMessageFromResponse(operation: string, response: Response): Promise<string> {
  const baseMessage = buildHttpErrorMessage(operation, response.status);
  const upstreamDetail = await readUpstreamErrorDetail(response);
  return upstreamDetail ? `${baseMessage} 上游返回：${upstreamDetail}` : baseMessage;
}

async function readUpstreamErrorDetail(response: Response): Promise<string> {
  try {
    const responseWithClone = response as Response & { clone?: () => Response };
    const readableResponse = typeof responseWithClone.clone === "function" ? responseWithClone.clone() : response;
    const text = typeof readableResponse.text === "function" ? await readableResponse.text() : "";
    if (text.trim()) return formatUpstreamErrorDetail(text);
  } catch {
    // Some mocked or proxied responses only expose json().
  }

  try {
    const json = await response.json();
    return formatUpstreamErrorDetail(json);
  } catch {
    return "";
  }
}

function formatUpstreamErrorDetail(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      return formatUpstreamErrorDetail(JSON.parse(trimmed));
    } catch {
      return limitText(trimmed);
    }
  }

  if (value && typeof value === "object") {
    const item = value as {
      error?: unknown;
      message?: unknown;
      msg?: unknown;
      detail?: unknown;
      code?: unknown;
      type?: unknown;
    };
    const nested = item.error;
    if (nested) {
      const nestedDetail = formatUpstreamErrorDetail(nested);
      if (nestedDetail) return nestedDetail;
    }
    for (const key of ["message", "msg", "detail", "code", "type"] as const) {
      if (typeof item[key] === "string" && item[key].trim()) return limitText(item[key].trim());
    }
    try {
      return limitText(JSON.stringify(value));
    } catch {
      return "";
    }
  }

  return "";
}

function limitText(text: string, maxLength = 500): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function isGeminiImageModel(imageModel: string): boolean {
  return imageModel.trim().startsWith("gemini-");
}

function isGeminiNativeEndpoint(endpoint: string): boolean {
  const normalized = endpoint.trim().toLowerCase();
  return normalized.includes("generativelanguage.googleapis.com") || normalized.includes(":generatecontent");
}

function resolveGeminiModelName(imageModel: string): string {
  const normalized = imageModel.trim();
  const modelMap: Record<string, string> = {
    "gemini-3.1-flash-preview": "gemini-3.1-flash-image",
    "gemini-3-pro-image-preview": "gemini-3-pro-image",
  };
  return modelMap[normalized] ?? normalized.replace(/-preview$/, "");
}

function resolveGeminiGenerateContentEndpoint(endpoint: string, imageModel: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (trimmed.includes(":generateContent")) return trimmed;
  const base = trimmed.replace(/\/models\/[^/]+$/, "");
  return `${base}/models/${resolveGeminiModelName(imageModel)}:generateContent`;
}

function resolveThirdPartyGeminiGenerateContentEndpoint(endpoint: string, imageModel: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (trimmed.includes(":generateContent")) return trimmed;
  const base = trimmed.replace(/\/v1(?:\/.*)?$/, "/v1beta").replace(/\/v1beta(?:\/.*)?$/, "/v1beta");
  return `${base}/models/${resolveThirdPartyGeminiImageModelName(imageModel)}:generateContent`;
}

function resolveThirdPartyGeminiImageModelName(imageModel: string): string {
  const normalized = imageModel.trim();
  const modelMap: Record<string, string> = {
    "gemini-3.1-flash-preview": "gemini-3.1-flash-image-preview",
    "gemini-3-pro-image-preview": "gemini-3-pro-image-preview",
  };
  return modelMap[normalized] ?? normalized;
}

function normalizeImageRatio(imageRatio: string): string {
  return imageRatio.trim().replace(/[：﹕]/g, ":");
}

function extractGeminiImages(data: unknown): string[] {
  const candidates = (data as { candidates?: Array<{ content?: { parts?: unknown[] } }> })?.candidates;
  if (!Array.isArray(candidates)) return [];

  return candidates
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => {
      const item = part as {
        inlineData?: { mimeType?: string; data?: string };
        inline_data?: { mime_type?: string; data?: string };
      };
      const inlineData = item.inlineData;
      if (typeof inlineData?.data === "string") {
        return `data:${inlineData.mimeType || "image/png"};base64,${inlineData.data}`;
      }
      const inlineDataSnake = item.inline_data;
      if (typeof inlineDataSnake?.data === "string") {
        return `data:${inlineDataSnake.mime_type || "image/png"};base64,${inlineDataSnake.data}`;
      }
      return "";
    })
    .filter(Boolean);
}

function extractChatCompletionImages(data: unknown): string[] {
  const choices = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices;
  if (!Array.isArray(choices)) return [];

  return choices
    .flatMap((choice) => extractImagesFromContent(choice.message?.content))
    .filter(Boolean);
}

function extractImageGenerationImages(data: unknown): string[] {
  return uniqueImageReferences(extractImagesFromUnknown(data));
}

function extractImagesFromUnknown(value: unknown): string[] {
  if (typeof value === "string") return extractImageReferencesFromText(value);
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => extractImagesFromUnknown(item));

  const item = value as Record<string, unknown>;
  const references: string[] = [];
  const directUrl =
    item.url ??
    item.image_url ??
    item.imageUrl ??
    item.image ??
    item.output_url ??
    item.outputUrl ??
    item.file_url ??
    item.fileUrl ??
    item.download_url ??
    item.downloadUrl ??
    item.public_url ??
    item.publicUrl;
  const directBase64 = item.b64_json ?? item.b64Json ?? item.base64 ?? item.image_base64 ?? item.imageBase64;
  const inlineData = item.inlineData as { mimeType?: unknown; data?: unknown } | undefined;
  const inlineDataSnake = item.inline_data as { mime_type?: unknown; data?: unknown } | undefined;

  if (typeof directUrl === "string") references.push(directUrl);
  if (directUrl && typeof directUrl === "object") references.push(...extractImagesFromUnknown(directUrl));
  if (typeof directBase64 === "string") references.push(`data:image/png;base64,${directBase64}`);
  if (typeof inlineData?.data === "string") {
    references.push(`data:${typeof inlineData.mimeType === "string" ? inlineData.mimeType : "image/png"};base64,${inlineData.data}`);
  }
  if (typeof inlineDataSnake?.data === "string") {
    references.push(
      `data:${typeof inlineDataSnake.mime_type === "string" ? inlineDataSnake.mime_type : "image/png"};base64,${inlineDataSnake.data}`,
    );
  }

  for (const child of Object.values(item)) {
    if (child === directUrl || child === directBase64 || child === inlineData || child === inlineDataSnake) continue;
    references.push(...extractImagesFromUnknown(child));
  }

  return references;
}

function uniqueImageReferences(references: string[]): string[] {
  return [...new Set(references.filter(Boolean))];
}

function extractChatCompletionText(data: unknown): string | null {
  const root = data as {
    choices?: Array<{
      text?: unknown;
      message?: {
        content?: unknown;
        reasoning_content?: unknown;
        reasoningContent?: unknown;
      };
      delta?: {
        content?: unknown;
      };
    }>;
    output_text?: unknown;
    text?: unknown;
  };
  const choice = Array.isArray(root.choices) ? root.choices[0] : undefined;
  const content = choice?.message?.content ?? choice?.text ?? choice?.delta?.content ?? root.output_text ?? root.text;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        const item = part as { text?: unknown; content?: unknown };
        if (typeof item.text === "string") return item.text;
        if (typeof item.content === "string") return item.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
    return text || null;
  }

  const reasoningContent = choice?.message?.reasoning_content ?? choice?.message?.reasoningContent;
  return typeof reasoningContent === "string" ? reasoningContent : null;
}

function extractStreamingDeltaText(data: unknown): string | null {
  const root = data as {
    delta?: unknown;
    type?: unknown;
    choices?: Array<{
      delta?: {
        content?: unknown;
      };
      message?: {
        content?: unknown;
      };
    }>;
    output_text?: unknown;
    outputText?: unknown;
    text?: unknown;
  };
  const choice = Array.isArray(root.choices) ? root.choices[0] : undefined;
  const content =
    choice?.delta?.content ??
    choice?.message?.content ??
    root.delta ??
    root.output_text ??
    root.outputText ??
    root.text;
  return extractTextFromContentPart(content);
}

function extractTextFromContentPart(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!content) return null;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => extractTextFromContentPart(part))
      .filter(Boolean)
      .join("");
    return text || null;
  }
  if (typeof content === "object") {
    const item = content as {
      text?: unknown;
      content?: unknown;
      output_text?: unknown;
      outputText?: unknown;
    };
    return (
      extractTextFromContentPart(item.text) ??
      extractTextFromContentPart(item.content) ??
      extractTextFromContentPart(item.output_text) ??
      extractTextFromContentPart(item.outputText)
    );
  }
  return null;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractImagesFromContent(content: unknown): string[] {
  if (typeof content === "string") return extractImageReferencesFromText(content);
  if (!Array.isArray(content)) return [];

  return content.flatMap((part) => {
    const item = part as {
      type?: string;
      text?: string;
      image_url?: string | { url?: string };
      imageUrl?: string | { url?: string };
      b64_json?: string;
    };
    const imageUrl = item.image_url ?? item.imageUrl;
    if (typeof imageUrl === "string") return [imageUrl];
    if (typeof imageUrl?.url === "string") return [imageUrl.url];
    if (typeof item.b64_json === "string") return [`data:image/png;base64,${item.b64_json}`];
    if (typeof item.text === "string") return extractImageReferencesFromText(item.text);
    return [];
  });
}

function extractImageReferencesFromText(text: string): string[] {
  const references = new Set<string>();
  const dataUrlPattern = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
  for (const match of text.matchAll(dataUrlPattern)) references.add(match[0]);

  const markdownImagePattern = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g;
  for (const match of text.matchAll(markdownImagePattern)) references.add(match[1]);

  const htmlImagePattern = /<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
  for (const match of text.matchAll(htmlImagePattern)) references.add(match[1]);

  const jsonImageUrlPattern =
    /["'](?:url|image_url|imageUrl|image|output_url|outputUrl|file_url|fileUrl|download_url|downloadUrl|public_url|publicUrl)["']\s*:\s*["'](https?:\/\/[^"']+)["']/g;
  for (const match of text.matchAll(jsonImageUrlPattern)) references.add(match[1]);

  const imageUrlPattern = /https?:\/\/[^\s)"'<>]+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s)"'<>]+)?/gi;
  for (const match of text.matchAll(imageUrlPattern)) references.add(match[0]);

  return [...references];
}

function resolveImageSize(imageRatio: string, imageResolution: string, imageModel = ""): string {
  const normalized = normalizeImageRatio(imageRatio);
  const normalizedResolution = imageResolution.trim().toUpperCase();
  if (imageModel.trim().startsWith("gpt-image")) {
    const oneKGptImageSizes: Record<string, string> = {
      "1:1": "1024x1024",
      "16:9": "1536x1024",
      "9:16": "1024x1536",
      "21:9": "1536x1024",
      "4:3": "1536x1024",
      "3:4": "1024x1536",
    };
    const twoKGptImageSizes: Record<string, string> = {
      "1:1": "2048x2048",
      "16:9": "2560x1440",
      "9:16": "1440x2560",
      "21:9": "2560x1080",
      "4:3": "2048x1536",
      "3:4": "1536x2048",
    };
    const fourKGptImageSizes: Record<string, string> = {
      "1:1": "4096x4096",
      "16:9": "3840x2160",
      "9:16": "2160x3840",
      "21:9": "4096x1755",
      "4:3": "4096x3072",
      "3:4": "3072x4096",
    };
    const gptImageSizes = normalizedResolution === "4K" ? fourKGptImageSizes : normalizedResolution === "2K" ? twoKGptImageSizes : oneKGptImageSizes;
    return gptImageSizes[normalized] ?? gptImageSizes["16:9"];
  }
  const oneKSizes: Record<string, string> = {
    "1:1": "1024x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792",
    "21:9": "1792x768",
    "4:3": "1536x1024",
    "3:4": "1024x1536",
  };
  const twoKSizes: Record<string, string> = {
    "1:1": "2048x2048",
    "16:9": "2560x1440",
    "9:16": "1440x2560",
    "21:9": "2560x1080",
    "4:3": "2048x1536",
    "3:4": "1536x2048",
  };
  const fourKSizes: Record<string, string> = {
    "1:1": "4096x4096",
    "16:9": "3840x2160",
    "9:16": "2160x3840",
    "21:9": "4096x1755",
    "4:3": "4096x3072",
    "3:4": "3072x4096",
  };
  const sizes = normalizedResolution === "4K" ? fourKSizes : normalizedResolution === "2K" ? twoKSizes : oneKSizes;
  return sizes[normalized] ?? sizes["16:9"];
}

function resolveChatCompletionsEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function resolveImageGenerationsEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/images/generations")) return trimmed;
  return `${trimmed}/images/generations`;
}

