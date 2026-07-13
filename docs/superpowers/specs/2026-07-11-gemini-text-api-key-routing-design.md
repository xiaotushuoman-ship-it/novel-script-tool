# Gemini 文本 API Key 自动路由设计

## 目标

在 API 设置弹窗的“主 API Key”下方新增“Gemini 文本 API Key”。文本推理根据当前模型自动选择密钥：Gemini 文本模型使用 Gemini 文本 Key，GPT 文本模型使用主 Key；现有 Gemini 生图备用通道继续独立工作。

## 设置结构

- `apiKey`：主 API Key，供 GPT 文本模型和没有专用规则的文本模型使用。
- `geminiTextApiKey`：新增的 Gemini 文本 API Key，仅供 Gemini 文本推理使用。
- `apiKeySecondary`：保留现有高级设置中的备用分组 Key，供用户手动映射 DeepSeek、Qwen 等模型。
- `claudeApiKey`：保留 Claude 文本 Key。
- `geminiImageApiKey`：保留 Gemini 生图备用 Key，不能用于文本推理。

## 模型识别

模型名以 `gemini-` 开头且不是图片模型时，视为 Gemini 文本模型，包括当前的：

- `gemini-3.5-flash`
- `gemini-3.1-pro-preview`

未来新增同前缀的 Gemini 文本模型也自动使用 Gemini 文本 Key，不需要逐个硬编码。

GPT 模型名以 `gpt-` 或兼容旧格式 `gpt` 开头时，始终使用主 API Key，不受模型分组映射影响。

Claude 模型继续优先使用 Claude API Key。其他模型继续读取现有 `modelApiKeySources` 分组映射；没有映射时使用主 Key。

## 弹窗交互

1. “主 API Key”下方直接显示“Gemini 文本 API Key”密码输入框。
2. 输入框提示说明：选择 Gemini 文本模型时自动使用，仅用于文本推理。
3. 选择 Gemini 文本模型时，“当前模型分组”不再自动切换到备用分组。
4. Gemini 和 GPT 模型的密钥选择由模型类型自动决定；当前模型分组对这两类模型只显示自动路由状态，避免用户误以为可以切换。
5. DeepSeek、Qwen、Claude 等模型继续保留当前模型分组控制。
6. 测试连接调用与正式文本生成使用完全相同的密钥解析规则。

## 数据迁移

- 在 `AiSettings` 新增可选字段 `geminiTextApiKey`。
- 默认值为空，设置持久化到当前浏览器。
- 已经保存的 `gemini-3.5-flash -> secondary` 映射可以保留在数据中，但 Gemini 自动路由会忽略该旧映射。
- 如果 Gemini 文本 Key 为空，为避免旧用户立刻无法使用，回退到主 API Key；不回退到生图 Key。

## 路由优先级

文本请求密钥解析顺序：

1. Gemini 文本模型：`geminiTextApiKey`，为空时回退 `apiKey`。
2. GPT 文本模型：`apiKey`。
3. Claude 文本模型：`claudeApiKey`，为空时回退 `apiKey`。
4. 其他文本模型：读取 `modelApiKeySources`，可选择主、备用或 Claude Key。

## 不变范围

- API 地址仍使用统一文本 API 地址 `settings.endpoint`。
- 请求体模型名不改写。
- Gemini 生图备用地址、模型、Key 和图片路由不修改。
- 第1项、第10项及其他文本工作流无需单独适配，统一通过 `callAi` / `callAiStream` 自动路由。

## 测试要求

- 弹窗显示 Gemini 文本 API Key 输入框，且位置在主 Key 下方。
- 输入 Gemini 文本 Key 会更新 `geminiTextApiKey`。
- 选择 `gemini-3.5-flash` 不再写入备用分组映射。
- Gemini 普通和流式文本请求使用 Gemini 文本 Key。
- Gemini 文本 Key 为空时回退主 Key。
- GPT 普通和流式文本请求始终使用主 Key，即使存在备用映射。
- Gemini 生图备用通道现有测试继续通过。
