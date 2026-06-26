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
  it("uses the TimeAI endpoint and gpt-5.5 model by default", () => {
    const settings = loadAiSettings();

    expect(settings.endpoint).toBe("https://timeai.chat/v1");
    expect(settings.model).toBe("gpt-5.5");
    expect(settings.apiKeySource).toBe("primary");
    expect(settings.apiKeySecondary).toBe("");
    expect(settings.claudeApiKey).toBe("");
    expect(settings.modelApiKeySources).toEqual({});
    expect(settings.geminiImageEndpoint).toBe("https://timeai.chat/v1");
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
        claudeApiKey: "",
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

  it("migrates previously saved proxy endpoints to full TimeAI URLs for display", () => {
    localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({
        endpoint: "/api/timeai/v1",
        geminiImageEndpoint: "/api/timeai/v1",
        apiKey: "server-proxy",
        geminiImageApiKey: "server-proxy",
      }),
    );

    expect(loadAiSettings()).toMatchObject({
      endpoint: "https://timeai.chat/v1",
      geminiImageEndpoint: "https://timeai.chat/v1",
    });
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
        claudeApiKey: "sk-claude",
        apiKeySource: "secondary",
        modelApiKeySources: {
          "deepseek-v4-pro": "secondary",
        },
      }),
    ).toMatchObject({
      apiKey: "sk-primary",
      apiKeySecondary: "sk-secondary",
      claudeApiKey: "sk-claude",
      apiKeySource: "secondary",
      modelApiKeySources: {
        "deepseek-v4-pro": "secondary",
      },
    });
  });

  it("filters unsupported model key sources while preserving valid ones", () => {
    expect(
      normalizeAiSettings({
        apiKey: "sk-primary",
        modelApiKeySources: {
          "gpt-5.5": "primary",
          "deepseek-v4-pro": "secondary",
          "claude-opus-4-8": "claude",
          broken: "unknown" as never,
        },
      }),
    ).toMatchObject({
      modelApiKeySources: {
        "gpt-5.5": "primary",
        "deepseek-v4-pro": "secondary",
        "claude-opus-4-8": "claude",
      },
    });
  });

  it("keeps full TimeAI endpoints visible on deployed runtime urls", () => {
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
      endpoint: "https://timeai.chat/v1",
      geminiImageEndpoint: "https://timeai.chat/v1",
    });
  });
});
