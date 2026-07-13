# Gemini Text API Key Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Gemini text API key and automatically route Gemini text models to it while GPT models always use the primary key.

**Architecture:** Extend `AiSettings` with `geminiTextApiKey`, persist it through the existing settings normalization, and centralize model-family routing in `resolveApiKey`. The settings dialog displays the new key directly below the primary key and removes the temporary first-selection secondary mapping for `gemini-3.5-flash`.

**Tech Stack:** TypeScript, React, Vitest, Testing Library

---

### Task 1: Add and persist the Gemini text key

**Files:**
- Modify: `src/domain/aiClient.ts`
- Modify: `src/domain/aiSettings.ts`
- Modify: `src/domain/aiSettings.test.ts`

- [ ] **Step 1: Write failing settings normalization tests**

Add tests asserting:

```ts
expect(normalizeAiSettings({ geminiTextApiKey: " sk-gemini-text " }).geminiTextApiKey).toBe("sk-gemini-text");
expect(normalizeAiSettings(null).geminiTextApiKey).toBe("");
```

- [ ] **Step 2: Run settings tests and verify RED**

Run: `npm test -- src/domain/aiSettings.test.ts`

Expected: TypeScript/test failure because `geminiTextApiKey` is not part of `AiSettings` or normalized output.

- [ ] **Step 3: Extend the settings type and defaults**

Add to `AiSettings`:

```ts
geminiTextApiKey?: string;
```

Add `geminiTextApiKey: ""` to `DEFAULT_AI_SETTINGS`. In `normalizeAiSettingsForRuntime`, trim and return the field, defaulting to an empty string.

- [ ] **Step 4: Run settings tests and verify GREEN**

Run: `npm test -- src/domain/aiSettings.test.ts`

Expected: all settings tests PASS.

### Task 2: Add the Gemini text key field to the dialog

**Files:**
- Modify: `src/components/SettingsDialog.test.tsx`
- Modify: `src/components/SettingsDialog.tsx`

- [ ] **Step 1: Replace the temporary secondary-mapping tests**

Remove the tests that expect selecting `gemini-3.5-flash` to write `secondary`. Add tests that assert:

```ts
const primaryKey = screen.getByLabelText("主 API Key");
const geminiTextKey = screen.getByLabelText("Gemini 文本 API Key");
expect(primaryKey.compareDocumentPosition(geminiTextKey) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
```

Change the Gemini text key input and assert:

```ts
expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ geminiTextApiKey: "sk-gemini-text" }));
```

Select `gemini-3.5-flash` and assert `onChange` updates only the model while preserving the existing map without adding `secondary`.

- [ ] **Step 2: Run dialog tests and verify RED**

Run: `npm test -- src/components/SettingsDialog.test.tsx`

Expected: FAIL because the new input does not exist and the temporary auto-secondary behavior remains.

- [ ] **Step 3: Add the input and remove temporary mapping**

Add a labeled password input directly below the primary key:

```tsx
<label>
  <span>Gemini 文本 API Key</span>
  <input
    type="password"
    value={settings.geminiTextApiKey ?? ""}
    onChange={(event) => onChange({ ...settings, geminiTextApiKey: event.target.value })}
    placeholder="sk-..."
  />
  <small className="field-hint">选择 Gemini 文本模型时自动使用，仅用于文本推理。</small>
</label>
```

Replace `updateTextModel` with a plain model update that preserves `modelApiKeySources` and does not create a secondary mapping.

- [ ] **Step 4: Run dialog tests and verify GREEN**

Run: `npm test -- src/components/SettingsDialog.test.tsx`

Expected: all dialog tests PASS, including existing image fallback tests.

### Task 3: Route text model families to the correct key

**Files:**
- Modify: `src/domain/aiClient.test.ts`
- Modify: `src/domain/aiClient.ts`

- [ ] **Step 1: Replace temporary Gemini secondary-key tests**

Update normal and streaming Gemini tests to use:

```ts
apiKey: "sk-primary",
apiKeySecondary: "sk-secondary",
geminiTextApiKey: "sk-gemini-text",
model: "gemini-3.5-flash",
modelApiKeySources: { "gemini-3.5-flash": "secondary" },
```

Assert `Authorization: Bearer sk-gemini-text`, proving the old secondary mapping is ignored.

- [ ] **Step 2: Add fallback and GPT priority tests**

Add a Gemini test with `geminiTextApiKey: ""` and assert the primary key is used. Add a GPT test with a secondary mapping and assert GPT still uses the primary key.

- [ ] **Step 3: Run AI client tests and verify RED**

Run: `npm test -- src/domain/aiClient.test.ts`

Expected: FAIL because `resolveApiKey` still follows `modelApiKeySources` before model-family routing.

- [ ] **Step 4: Implement model-family routing**

Add helpers:

```ts
function isGeminiTextModel(model: string) {
  return model.toLowerCase().startsWith("gemini-") && !isGeminiImageModel(model);
}

function isGptTextModel(model: string) {
  return /^gpt-?/i.test(model);
}
```

Update `resolveApiKey`:

```ts
const model = settings.model.trim();
if (isGeminiTextModel(model)) return settings.geminiTextApiKey?.trim() || settings.apiKey.trim();
if (isGptTextModel(model)) return settings.apiKey.trim();
```

Then preserve existing Claude and generic model-group behavior.

- [ ] **Step 5: Run AI client tests and verify GREEN**

Run: `npm test -- src/domain/aiClient.test.ts`

Expected: all AI client tests PASS.

### Task 4: Verify the complete application

**Files:**
- Modify: `src/domain/aiClient.ts`
- Modify: `src/domain/aiClient.test.ts`
- Modify: `src/domain/aiSettings.ts`
- Modify: `src/domain/aiSettings.test.ts`
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/components/SettingsDialog.test.tsx`

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite build PASS with only existing non-blocking warnings.

- [ ] **Step 3: Inspect routing scope**

Run:

```powershell
git diff --check
rg -n "geminiTextApiKey|gemini-3.5-flash|Gemini 生图备用通道" src/domain/aiClient.ts src/domain/aiSettings.ts src/components/SettingsDialog.tsx
```

Expected: Gemini text routing uses the dedicated field; image fallback fields and model list are unchanged.

- [ ] **Step 4: Leave changes local**

Do not commit, push, or deploy. Synchronize only when the user explicitly says `同步更新`.
