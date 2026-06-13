import type { AiSettings } from "./aiClient";

export const AI_SETTINGS_KEY = "novel-script-tool.ai-settings";
const PROXY_TIMEAI_ENDPOINT = "/api/timeai/v1";
const PROXY_API_KEY_PLACEHOLDER = "server-proxy";
const LOCAL_PROXY_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export const DEFAULT_AI_SETTINGS: AiSettings = {
  endpoint: PROXY_TIMEAI_ENDPOINT,
  apiKey: PROXY_API_KEY_PLACEHOLDER,
  apiKeySecondary: "",
  apiKeySource: "primary",
  modelApiKeySources: {},
  model: "gpt-5.5",
  geminiImageEndpoint: PROXY_TIMEAI_ENDPOINT,
  geminiImageApiKey: PROXY_API_KEY_PLACEHOLDER,
  geminiImageModel: "gemini-3.1-flash-preview",
};

export function normalizeAiSettings(settings: Partial<AiSettings> | null | undefined): AiSettings {
  return normalizeAiSettingsForRuntime(settings);
}

export function normalizeAiSettingsForRuntime(
  settings: Partial<AiSettings> | null | undefined,
  runtimeUrl = globalThis.location?.href ?? "",
): AiSettings {
  const model = settings?.model?.trim();
  const geminiImageModel = settings?.geminiImageModel?.trim();
  const geminiImageEndpoint = settings?.geminiImageEndpoint?.trim();
  const geminiImageApiKey = settings?.geminiImageApiKey?.trim();
  const apiKeySecondary = settings?.apiKeySecondary?.trim();
  const apiKeySource = settings?.apiKeySource === "secondary" ? "secondary" : "primary";
  const modelApiKeySources = settings?.modelApiKeySources;
  const forceProxy = shouldForceProxyEndpoint(runtimeUrl);

  return {
    endpoint: forceProxy ? PROXY_TIMEAI_ENDPOINT : settings?.endpoint?.trim() || DEFAULT_AI_SETTINGS.endpoint,
    apiKey: settings?.apiKey?.trim() || DEFAULT_AI_SETTINGS.apiKey,
    apiKeySecondary: apiKeySecondary || DEFAULT_AI_SETTINGS.apiKeySecondary,
    apiKeySource,
    modelApiKeySources:
      modelApiKeySources && typeof modelApiKeySources === "object" ? modelApiKeySources : {},
    model: model === "gpt5.5" ? "gpt-5.5" : model || DEFAULT_AI_SETTINGS.model,
    geminiImageEndpoint: forceProxy ? PROXY_TIMEAI_ENDPOINT : geminiImageEndpoint || DEFAULT_AI_SETTINGS.geminiImageEndpoint,
    geminiImageApiKey: geminiImageApiKey || DEFAULT_AI_SETTINGS.geminiImageApiKey,
    geminiImageModel: geminiImageModel || DEFAULT_AI_SETTINGS.geminiImageModel,
  };
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    return normalizeAiSettingsForRuntime(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings: AiSettings) {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(normalizeAiSettingsForRuntime(settings)));
}

function shouldForceProxyEndpoint(runtimeUrl: string): boolean {
  try {
    const location = new URL(runtimeUrl, "http://localhost");
    return !LOCAL_PROXY_HOSTNAMES.has(location.hostname);
  } catch {
    return false;
  }
}
