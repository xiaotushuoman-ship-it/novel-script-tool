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
const PROXY_UPLOAD_MAX_BYTES = 1.5 * 1024 * 1024;

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
      headers: sanitizeBrowserUploadHeaders(presignData.headers),
      body: file,
    });
  } catch {
    return uploadAistarsLabMaterialThroughProxy(settings, file, fetchImpl);
  }
  if (!uploadResponse.ok) {
    return uploadAistarsLabMaterialThroughProxy(settings, file, fetchImpl);
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
  const uploadFile = await prepareFileForProxyUpload(file);
  const base64 = await fileToBase64(uploadFile);
  const response = await fetchImpl("/api/aistarslab-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      filename: uploadFile.name,
      contentType: uploadFile.type || "application/octet-stream",
      size: uploadFile.size,
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

function sanitizeBrowserUploadHeaders(headers: Record<string, string> | undefined) {
  const nextHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const normalizedKey = key.toLowerCase();
    if (["content-length", "host", "authorization"].includes(normalizedKey)) continue;
    nextHeaders[key] = value;
  }
  return nextHeaders;
}

async function prepareFileForProxyUpload(file: File) {
  if (file.size <= PROXY_UPLOAD_MAX_BYTES) return file;
  if (!file.type.startsWith("image/")) {
    throw new Error("素材过大且浏览器直传失败。请压缩素材后再上传，或使用公网素材 URL。");
  }
  const compressed = await compressImageFile(file, PROXY_UPLOAD_MAX_BYTES);
  if (compressed.size > PROXY_UPLOAD_MAX_BYTES) {
    throw new Error("图片仍然超过网页端代理上传限制。请压缩到 1.5MB 以内后再上传。");
  }
  return compressed;
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

async function compressImageFile(file: File, maxBytes: number) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  let quality = 0.86;
  let blob = await drawImageToBlob(canvas, image, width, height, quality);

  while (blob.size > maxBytes && (quality > 0.52 || width > 1280 || height > 1280)) {
    if (quality > 0.52) {
      quality = Math.max(0.52, quality - 0.08);
    } else {
      width = Math.max(960, Math.floor(width * 0.86));
      height = Math.max(960, Math.floor(height * 0.86));
      quality = 0.72;
    }
    blob = await drawImageToBlob(canvas, image, width, height, quality);
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "reference";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片压缩失败：无法读取图片"));
    image.src = src;
  });
}

function drawImageToBlob(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  width: number,
  height: number,
  quality: number,
) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("图片压缩失败：浏览器不支持 Canvas");
  context.drawImage(image, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片压缩失败：无法生成压缩图片"));
    }, "image/jpeg", quality);
  });
}
