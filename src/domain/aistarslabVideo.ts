export type AistarsLabVideoSettings = {
  endpoint: string;
  apiKey: string;
};

export type AistarsLabVideoConfig = {
  referenceVideoCreditsMultiplier?: number;
  channels: Array<{
    channel: string;
    title: string;
    description?: string;
    secondsMin: number;
    secondsMax: number;
    aspectRatios: string[];
    supportedModeTypes: string[];
    frames2VideoSupportsAudio?: boolean;
    defaultOption?: boolean;
    models: Array<{
      model: string;
      label: string;
      resolutions: string[];
      fixedTotalCredits?: number | null;
      creditsPerSecond?: number | null;
      defaultOption?: boolean;
    }>;
  }>;
};

export type AistarsLabVideoTask = {
  channel?: string;
  taskId: string;
  model?: string;
  prompt?: string;
  status: number;
  progress?: number;
  outputType?: string;
  outputUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  costCredits?: number;
  seconds?: number;
  size?: string;
};

export type CreateAistarsLabVideoTaskInput = {
  channel: string;
  model: string;
  resolution?: string;
  prompt: string;
  seconds: number;
  size: string;
  modeType: string;
  images?: string[];
  videos?: string[];
  audios?: string[];
};

export type UploadedMaterial = {
  fileKey: string;
  url: string;
  size: number;
  contentType: string;
  costCredits?: number;
};

const DEFAULT_PROXY_ENDPOINT = "/api/aistarslab/openapi";
const DEFAULT_TEST_MODEL = "test-video";
const DEFAULT_TEST_RESOLUTION = "720p";

export function getSeedanceChannel(config: AistarsLabVideoConfig | null, channelValue?: string) {
  const channels = config?.channels ?? [];
  return channels.find((channel) => channel.channel === channelValue) ?? channels.find((channel) => channel.defaultOption) ?? channels[0] ?? null;
}

export function getSeedanceModelsForChannel(config: AistarsLabVideoConfig | null, channelValue?: string) {
  return getSeedanceChannel(config, channelValue)?.models ?? [];
}

export function getSeedanceModelForChannel(
  config: AistarsLabVideoConfig | null,
  channelValue?: string,
  modelValue?: string,
) {
  const models = getSeedanceModelsForChannel(config, channelValue);
  return models.find((model) => model.model === modelValue) ?? models.find((model) => model.defaultOption) ?? models[0] ?? null;
}

export function resolveSeedanceModelSelection(
  config: AistarsLabVideoConfig | null,
  channelValue?: string,
  modelValue?: string,
) {
  const channel = getSeedanceChannel(config, channelValue);
  const model = getSeedanceModelForChannel(config, channel?.channel ?? channelValue, modelValue);
  return {
    channel: channel?.channel ?? channelValue ?? "test",
    model: model?.model ?? modelValue ?? DEFAULT_TEST_MODEL,
    resolution: model?.resolutions?.[0] ?? DEFAULT_TEST_RESOLUTION,
  };
}

export function normalizeSeedanceVideoCount(value: string | number | undefined, max = 6) {
  const count = typeof value === "number" ? value : Number.parseInt(String(value || "1"), 10);
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(Math.floor(count), 1), max);
}

export function normalizeAistarsLabEndpoint(endpoint = DEFAULT_PROXY_ENDPOINT) {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "https://api.video.aistarslab.com/openapi") return DEFAULT_PROXY_ENDPOINT;
  if (trimmed === "https://api.video.aistarslab.com") return DEFAULT_PROXY_ENDPOINT;
  return trimmed;
}

export async function fetchAistarsLabVideoConfig(settings: AistarsLabVideoSettings, fetchImpl = fetch) {
  const response = await requestOpenApi(settings, "/video/task/config", { method: "GET" }, fetchImpl);
  return response.data as AistarsLabVideoConfig;
}

export async function fetchAistarsLabCredits(settings: AistarsLabVideoSettings, fetchImpl = fetch) {
  const response = await requestOpenApi(settings, "/account/credits", { method: "GET" }, fetchImpl);
  return Number(response.data?.credits ?? 0);
}

export async function createAistarsLabVideoTask(
  settings: AistarsLabVideoSettings,
  input: CreateAistarsLabVideoTaskInput,
  fetchImpl = fetch,
) {
  const response = await requestOpenApi(
    settings,
    "/video/task/v2",
    {
      method: "POST",
      body: JSON.stringify({
        ...input,
        images: input.images?.filter(Boolean),
        videos: input.videos?.filter(Boolean),
        audios: input.audios?.filter(Boolean),
      }),
    },
    fetchImpl,
  );
  return response.data as Pick<AistarsLabVideoTask, "taskId" | "status" | "costCredits">;
}

export async function fetchAistarsLabVideoTask(settings: AistarsLabVideoSettings, taskId: string, fetchImpl = fetch) {
  const response = await requestOpenApi(
    settings,
    `/video/task/status?taskId=${encodeURIComponent(taskId)}`,
    { method: "GET" },
    fetchImpl,
  );
  return response.data as AistarsLabVideoTask;
}

export async function uploadAistarsLabMaterial(settings: AistarsLabVideoSettings, file: File, fetchImpl = fetch) {
  const presign = await requestOpenApi(
    settings,
    "/uploads/presign",
    {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      }),
    },
    fetchImpl,
  );
  const presignData = presign.data as {
    uploadUrl?: string;
    method?: string;
    headers?: Record<string, string>;
    fileKey?: string;
  };
  if (!presignData.uploadUrl || !presignData.fileKey) {
    throw new Error("素材上传失败：平台没有返回上传地址");
  }

  let uploadResponse: Response;
  try {
    uploadResponse = await fetchImpl(presignData.uploadUrl, {
      method: presignData.method || "PUT",
      headers: presignData.headers || {},
      body: file,
    });
  } catch {
    return uploadAistarsLabMaterialThroughProxy(settings, file, fetchImpl);
  }
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(`素材直传失败：HTTP ${uploadResponse.status}${detail ? `：${detail.slice(0, 160)}` : ""}`);
  }

  const completed = await requestOpenApi(
    settings,
    "/uploads/complete",
    {
      method: "POST",
      body: JSON.stringify({
        fileKey: presignData.fileKey,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      }),
    },
    fetchImpl,
  );
  return completed.data as UploadedMaterial;
}

async function uploadAistarsLabMaterialThroughProxy(settings: AistarsLabVideoSettings, file: File, fetchImpl: typeof fetch) {
  const base64 = await fileToBase64(file);
  const response = await fetchImpl("/api/aistarslab-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      base64,
    }),
  });
  const text = await response.text();
  const json = parseJsonResponse(text);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${extractErrorMessage(json)}`);
  }
  if (typeof json.code === "number" && json.code !== 0) {
    throw new Error(json.msg || `AIStartLab 素材上传失败：${json.code}`);
  }
  return json.data as UploadedMaterial;
}

async function requestOpenApi(
  settings: AistarsLabVideoSettings,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
) {
  const apiKey = settings.apiKey.trim();
  if (!apiKey) throw new Error("请先填写 AIStartLab API KEY");

  const response = await fetchImpl(buildOpenApiUrl(settings.endpoint, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const json = parseJsonResponse(text);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${extractErrorMessage(json)}`);
  }
  if (typeof json.code === "number" && json.code !== 0) {
    throw new Error(json.msg || `AIStartLab 接口失败：${json.code}`);
  }
  return json;
}

function buildOpenApiUrl(endpoint: string, path: string) {
  const base = normalizeAistarsLabEndpoint(endpoint);
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function extractErrorMessage(json: unknown) {
  if (json && typeof json === "object") {
    const value = json as { msg?: string; text?: string; error?: { message?: string } };
    return value.error?.message || value.msg || value.text || JSON.stringify(json);
  }
  return "请求失败";
}

function parseJsonResponse(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function fileToBase64(file: File) {
  if (typeof file.arrayBuffer !== "function") {
    return fileToBase64WithReader(file);
  }
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function fileToBase64WithReader(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.split(",").pop() || "" : value);
    };
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}
