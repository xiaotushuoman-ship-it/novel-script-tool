import type { AiSettings } from "./aiClient";

export const AI_SETTINGS_KEY = "novel-script-tool.ai-settings";
const PROXY_TIMEAI_ENDPOINT = "/api/timeai/v1";
const DEFAULT_TIMEAI_ENDPOINT = "https://timeai.chat/v1";
const PROXY_API_KEY_PLACEHOLDER = "server-proxy";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  endpoint: DEFAULT_TIMEAI_ENDPOINT,
  apiKey: PROXY_API_KEY_PLACEHOLDER,
  apiKeySecondary: "",
  claudeApiKey: "",
  apiKeySource: "primary",
  modelApiKeySources: {},
  model: "gpt-5.5",
  geminiImageEndpoint: DEFAULT_TIMEAI_ENDPOINT,
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
  const endpoint = normalizeDisplayEndpoint(settings?.endpoint);
  const geminiImageEndpoint = normalizeDisplayEndpoint(settings?.geminiImageEndpoint);
  const geminiImageApiKey = settings?.geminiImageApiKey?.trim();
  const apiKeySecondary = settings?.apiKeySecondary?.trim();
  const claudeApiKey = settings?.claudeApiKey?.trim();
  const apiKeySource = settings?.apiKeySource === "secondary" ? "secondary" : "primary";
  const modelApiKeySources = settings?.modelApiKeySources;
  void runtimeUrl;

  return {
    endpoint,
    apiKey: settings?.apiKey?.trim() || DEFAULT_AI_SETTINGS.apiKey,
    apiKeySecondary: apiKeySecondary || DEFAULT_AI_SETTINGS.apiKeySecondary,
    claudeApiKey: claudeApiKey || DEFAULT_AI_SETTINGS.claudeApiKey,
    apiKeySource,
    modelApiKeySources:
      modelApiKeySources && typeof modelApiKeySources === "object"
        ? Object.fromEntries(
            Object.entries(modelApiKeySources).filter(([, value]) =>
              value === "primary" || value === "secondary" || value === "claude",
            ),
          )
        : {},
    model: model === "gpt5.5" ? "gpt-5.5" : model || DEFAULT_AI_SETTINGS.model,
    geminiImageEndpoint,
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

function normalizeDisplayEndpoint(endpoint: string | undefined): string {
  const trimmed = endpoint?.trim();
  if (!trimmed || trimmed === PROXY_TIMEAI_ENDPOINT) return DEFAULT_TIMEAI_ENDPOINT;
  return trimmed;
}
