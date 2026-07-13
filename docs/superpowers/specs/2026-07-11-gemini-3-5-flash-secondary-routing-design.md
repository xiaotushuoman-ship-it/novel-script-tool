# Gemini 3.5 Flash 文本备用分组路由设计

## 目标

在 API 设置弹窗的文本推理模型下拉中新增 `gemini-3.5-flash`。用户选中该模型时，系统自动将该模型绑定到现有“备用分组”，文本请求使用备用 API Key；Gemini 生图备用通道保持完全不变。

## 范围

- 文本模型列表新增 `gemini-3.5-flash`。
- 选择 `gemini-3.5-flash` 时，自动写入模型分组映射 `gemini-3.5-flash -> secondary`。
- 请求模型名保持为 `gemini-3.5-flash`，不替换成生图备用模型。
- 文本测试连接遵循相同的备用分组映射。
- 不修改 Gemini 生图备用 API 地址、API Key、备用模型或任何生图路由。

## 交互规则

1. 用户在“模型名”选择 `gemini-3.5-flash`。
2. 弹窗立即更新当前模型，并将“当前模型分组”显示为“备用分组”。
3. 如果用户随后手动把该模型改到主分组或 Claude 分组，保留用户的显式选择，不在每次渲染时强制改回。
4. 第一次选择该模型时自动绑定备用分组；已有保存映射时沿用保存映射。
5. 切换到其他模型时，各模型继续使用自己的历史分组映射；没有映射的模型沿用当前默认分组规则。

## 请求路由

文本请求继续使用主文本 API 地址 `settings.endpoint`，只通过现有 `modelApiKeySources` 和 `resolveApiKey` 选择备用 API Key。请求体中的 `model` 必须是 `gemini-3.5-flash`。

这里的“备用分组”指第三方中转站中的备用 API Key/分组，不是“Gemini 生图备用通道”。生图备用通道仍只服务图片模型。

## 数据兼容

- 不新增设置字段。
- 继续使用现有 `modelApiKeySources` 保存模型到分组的映射。
- 现有浏览器设置无需迁移。
- `normalizeAiSettings` 继续保留 `secondary` 映射。

## 测试要求

- 设置弹窗包含 `gemini-3.5-flash` 文本模型选项。
- 第一次选择该模型时，`onChange` 同时更新模型和备用分组映射。
- 已有显式映射时不覆盖用户选择。
- `callAi` 和 `callAiStream` 在该模型映射为备用分组时使用备用 API Key，并发送正确模型名。
- Gemini 生图备用通道字段和行为保持原样。
