import { beforeEach, describe, expect, it } from "vitest";
import {
  AI_SETTINGS_KEY,
  loadAiSettings,
  normalizeAiSettings,
  normalizeAiSettingsForRuntime,
} from "./aiSettings";

beforeEach(() => {
  localStorage.clear();
});

describe("AI settings", () => {
  it("uses the built-in server proxy endpoint and gpt-5.5 model by default", () => {
    const settings = loadAiSettings();

    expect(settings.endpoint).toBe("/api/timeai/v1");
    expect(settings.model).toBe("gpt-5.5");
    expect(settings.apiKeySource).toBe("primary");
    expect(settings.apiKeySecondary).toBe("");
    expect(settings.modelApiKeySources).toEqual({});
    expect(settings.geminiImageEndpoint).toBe("/api/timeai/v1");
    expect(settings.geminiImageModel).toBe("gemini-3.1-flash-preview");
    expect(settings.geminiImageApiKey).toBe("server-proxy");
    expect(settings.apiKey).toBe("server-proxy");
  });

  it("falls back to defaults when previously saved settings are blank", () => {
    localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({
        endpoint: "",
        apiKey: "",
        apiKeySecondary: "",
        apiKeySource: "",
        modelApiKeySources: {},
        model: "",
        geminiImageEndpoint: "",
        geminiImageApiKey: "",
        geminiImageModel: "",
      }),
    );

    expect(loadAiSettings()).toEqual(normalizeAiSettings(null));
  });

  it("migrates the old gpt5.5 spelling to the working gpt-5.5 model id", () => {
    expect(normalizeAiSettings({ model: "gpt5.5" }).model).toBe("gpt-5.5");
  });

  it("keeps the Gemini image fallback channel settings on local runtimes", () => {
    expect(
      normalizeAiSettingsForRuntime(
        {
          geminiImageEndpoint: "https://gemini.example/v1",
          geminiImageApiKey: "sk-gemini",
          geminiImageModel: "gemini-custom-image",
        },
        "http://127.0.0.1:5173/",
      ),
    ).toMatchObject({
      geminiImageEndpoint: "https://gemini.example/v1",
      geminiImageApiKey: "sk-gemini",
      geminiImageModel: "gemini-custom-image",
    });
  });

  it("keeps the secondary API key and model key map", () => {
    expect(
      normalizeAiSettings({
        apiKey: "sk-primary",
        apiKeySecondary: "sk-secondary",
        apiKeySource: "secondary",
        modelApiKeySources: {
          "deepseek-v4-pro": "secondary",
        },
      }),
    ).toMatchObject({
      apiKey: "sk-primary",
      apiKeySecondary: "sk-secondary",
      apiKeySource: "secondary",
      modelApiKeySources: {
        "deepseek-v4-pro": "secondary",
      },
    });
  });

  it("forces the proxy endpoint on deployed runtime urls", () => {
    expect(
      normalizeAiSettingsForRuntime(
        {
          endpoint: "https://timeai.chat/v1",
          geminiImageEndpoint: "https://timeai.chat/v1",
          apiKey: "sk-primary",
        },
        "https://novel-script-tool.vercel.app/",
      ),
    ).toMatchObject({
      endpoint: "/api/timeai/v1",
      geminiImageEndpoint: "/api/timeai/v1",
    });
  });
});
