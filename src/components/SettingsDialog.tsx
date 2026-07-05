import { useMemo, useState } from "react";
import { callAi, type AiSettings } from "../domain/aiClient";

type Props = {
  open: boolean;
  settings: AiSettings;
  onChange: (settings: AiSettings) => void;
  onClose: () => void;
  testTextModelConnection?: (settings: AiSettings) => Promise<string>;
};

const TEXT_MODEL_OPTIONS = [
  "gpt-5.5",
  "gemini-3.1-pro-preview",
  "deepseek-v4-pro",
  "qwen3.7-plus",
  "claude-opus-4-8",
];

const GEMINI_IMAGE_MODEL_OPTIONS = [
  "gemini-3.1-flash-preview",
  "gemini-3.1-flash-lite-image",
  "gemini-3-pro-image-preview",
];
const CONNECTION_TEST_PROMPT = "请只回复：连接正常";
const TIMEAI_REGISTER_URL = "https://timeai.chat/register?aff=k2gn";

async function defaultTestTextModelConnection(settings: AiSettings) {
  await callAi(settings, CONNECTION_TEST_PROMPT);
  return "连接正常";
}

function getCurrentModelApiKeySource(settings: AiSettings): "primary" | "secondary" | "claude" {
  return settings.modelApiKeySources?.[settings.model] ?? settings.apiKeySource ?? "primary";
}

export function SettingsDialog({
  open,
  settings,
  onChange,
  onClose,
  testTextModelConnection = defaultTestTextModelConnection,
}: Props) {
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState("");

  const currentModelKeySource = useMemo(() => getCurrentModelApiKeySource(settings), [settings]);

  if (!open) return null;

  async function runConnectionTest() {
    setIsTesting(true);
    setTestStatus("测试中...");
    try {
      const message = await testTextModelConnection(settings);
      setTestStatus(message || "连接正常");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setTestStatus(`连接失败：${message}`);
    } finally {
      setIsTesting(false);
    }
  }

  function updateCurrentModelKeySource(source: "primary" | "secondary" | "claude") {
    onChange({
      ...settings,
      apiKeySource: source === "secondary" ? "secondary" : "primary",
      modelApiKeySources: {
        ...(settings.modelApiKeySources ?? {}),
        [settings.model]: source,
      },
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-label="API 设置" className="dialog">
        <h2>API 设置</h2>
        <p>支持 OpenAI 兼容的 chat/completions 接口，密钥只保存在当前浏览器。</p>

        <label>
          <span>API 地址</span>
          <div className="endpoint-register-row">
            <input
              value={settings.endpoint}
              onChange={(event) => onChange({ ...settings, endpoint: event.target.value })}
              placeholder="https://timeai.chat/v1"
            />
            <button
              className="secondary-button"
              onClick={() => window.open(TIMEAI_REGISTER_URL, "_blank", "noopener,noreferrer")}
              type="button"
            >
              注册
            </button>
          </div>
        </label>

        <label className="model-test-field">
          <span>模型名</span>
          <div className="model-test-row">
            <select
              aria-label="模型名"
              value={settings.model}
              onChange={(event) => onChange({ ...settings, model: event.target.value })}
            >
              {[settings.model, ...TEXT_MODEL_OPTIONS]
                .filter((model, index, models) => model && models.indexOf(model) === index)
                .map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
            </select>
            <button className="secondary-button" disabled={isTesting} onClick={runConnectionTest} type="button">
              {isTesting ? "测试中" : "测试"}
            </button>
          </div>
        </label>

        {testStatus ? (
          <div className="connection-test-status" aria-live="polite">
            {testStatus}
          </div>
        ) : null}

        <label>
          <span>主 API Key</span>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(event) => onChange({ ...settings, apiKey: event.target.value })}
            placeholder="sk-..."
          />
          <small className="field-hint">当前模型可在下面切换到不同分组；这里保留一把主 Key。</small>
        </label>

        <label>
          <span>当前模型分组</span>
          <select
            aria-label="当前模型分组"
            value={currentModelKeySource}
            onChange={(event) => {
              const source =
                event.target.value === "secondary" ? "secondary" : event.target.value === "claude" ? "claude" : "primary";
              updateCurrentModelKeySource(source);
            }}
          >
            <option value="primary">主分组</option>
            <option value="secondary">备用分组</option>
            <option value="claude">Claude 分组</option>
          </select>
          <small className="field-hint">这里记录模型与中转分组的对应关系，不影响 Gemini 备用通道。</small>
        </label>

        <details className="advanced-settings">
          <summary>高级设置</summary>

          <label>
            <span>备用 API Key</span>
            <input
              type="password"
              value={settings.apiKeySecondary ?? ""}
              onChange={(event) => onChange({ ...settings, apiKeySecondary: event.target.value })}
              placeholder="sk-..."
            />
          </label>

          <label>
            <span>Claude API Key</span>
            <input
              type="password"
              value={settings.claudeApiKey ?? ""}
              onChange={(event) => onChange({ ...settings, claudeApiKey: event.target.value })}
              placeholder="sk-..."
            />
          </label>
        </details>

        <div className="panel-title image-fallback-title">Gemini 生图备用通道</div>

        <label>
          <span>备用 API 地址</span>
          <input
            value={settings.geminiImageEndpoint ?? ""}
            onChange={(event) => onChange({ ...settings, geminiImageEndpoint: event.target.value })}
            placeholder="https://timeai.chat/v1"
          />
        </label>

        <label>
          <span>备用模型</span>
          <select
            value={settings.geminiImageModel ?? ""}
            onChange={(event) => onChange({ ...settings, geminiImageModel: event.target.value })}
          >
            {[settings.geminiImageModel ?? "", ...GEMINI_IMAGE_MODEL_OPTIONS]
              .filter((model, index, models) => model && models.indexOf(model) === index)
              .map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
          </select>
        </label>

        <label>
          <span>备用 API Key</span>
          <input
            type="password"
            value={settings.geminiImageApiKey ?? ""}
            onChange={(event) => onChange({ ...settings, geminiImageApiKey: event.target.value })}
            placeholder="sk-..."
          />
        </label>

        <div className="action-row">
          <button onClick={onClose}>保存并关闭</button>
        </div>
      </section>
    </div>
  );
}
