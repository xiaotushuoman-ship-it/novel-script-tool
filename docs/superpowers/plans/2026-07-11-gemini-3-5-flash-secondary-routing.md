# Gemini 3.5 Flash Text Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `gemini-3.5-flash` to text model settings and automatically bind it to the existing secondary API-key group on first selection without changing image fallback routing.

**Architecture:** Reuse the existing `modelApiKeySources` map and `resolveApiKey` behavior. The settings dialog owns the first-selection default mapping, while the AI client remains model-agnostic and uses the saved secondary mapping for both streaming and non-streaming text calls.

**Tech Stack:** TypeScript, React, Vitest, Testing Library

---

### Task 1: Add the model and automatic secondary mapping

**Files:**
- Modify: `src/components/SettingsDialog.test.tsx`
- Modify: `src/components/SettingsDialog.tsx`

- [ ] **Step 1: Write failing settings tests**

Add tests that assert:

```ts
expect(screen.getByRole("option", { name: "gemini-3.5-flash" })).toBeInTheDocument();
```

Then render with `onChange={onChange}`, select `gemini-3.5-flash`, and assert:

```ts
expect(onChange).toHaveBeenCalledWith(
  expect.objectContaining({
    model: "gemini-3.5-flash",
    modelApiKeySources: expect.objectContaining({ "gemini-3.5-flash": "secondary" }),
  }),
);
```

Add a second test with an existing map `{ "gemini-3.5-flash": "primary" }` and assert selection preserves `primary` rather than overwriting it.

- [ ] **Step 2: Run the settings test and verify RED**

Run: `npm test -- src/components/SettingsDialog.test.tsx`

Expected: FAIL because the model is absent and selection only updates `model`.

- [ ] **Step 3: Add the model option and selection helper**

Add `gemini-3.5-flash` to `TEXT_MODEL_OPTIONS`.

Add a helper inside `SettingsDialog`:

```ts
function updateTextModel(model: string) {
  const existingSource = settings.modelApiKeySources?.[model];
  onChange({
    ...settings,
    model,
    modelApiKeySources: {
      ...(settings.modelApiKeySources ?? {}),
      ...(model === "gemini-3.5-flash" && !existingSource ? { [model]: "secondary" as const } : {}),
    },
  });
}
```

Use `updateTextModel(event.target.value)` in the text model select.

- [ ] **Step 4: Run the settings test and verify GREEN**

Run: `npm test -- src/components/SettingsDialog.test.tsx`

Expected: all settings-dialog tests PASS.

### Task 2: Lock text requests to the secondary key mapping

**Files:**
- Modify: `src/domain/aiClient.test.ts`
- Inspect only: `src/domain/aiClient.ts`

- [ ] **Step 1: Add non-streaming request coverage**

Add a `callAi` test using:

```ts
{
  endpoint: "https://timeai.chat/v1",
  apiKey: "sk-primary",
  apiKeySecondary: "sk-secondary",
  model: "gemini-3.5-flash",
  modelApiKeySources: { "gemini-3.5-flash": "secondary" },
}
```

Assert the request uses `Authorization: Bearer sk-secondary` and body model `gemini-3.5-flash`.

- [ ] **Step 2: Add streaming request coverage**

Add the same mapping to a `callAiStream` test. Return a minimal SSE stream and assert the request uses the secondary key and correct model name.

- [ ] **Step 3: Run AI client tests**

Run: `npm test -- src/domain/aiClient.test.ts`

Expected: tests PASS using the existing `resolveApiKey` implementation. If they fail, make the smallest correction to `resolveApiKey` without adding Gemini-specific image routing.

### Task 3: Verify no image fallback regression

**Files:**
- Modify: `src/components/SettingsDialog.test.tsx`
- Inspect: `src/domain/aiSettings.ts`

- [ ] **Step 1: Preserve image fallback assertions**

Keep the existing assertions that `Gemini 生图备用通道` remains visible and `gemini-3.1-flash-lite-image` remains an image fallback option. Add:

```ts
expect(screen.getByText("Gemini 生图备用通道")).toBeInTheDocument();
expect(screen.getByRole("option", { name: "gemini-3.1-flash-lite-image" })).toBeInTheDocument();
```

- [ ] **Step 2: Run focused settings and AI client tests**

Run: `npm test -- src/components/SettingsDialog.test.tsx src/domain/aiClient.test.ts`

Expected: all focused tests PASS.

### Task 4: Verify the complete application

**Files:**
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/components/SettingsDialog.test.tsx`
- Modify: `src/domain/aiClient.test.ts`

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: TypeScript and Vite build PASS with only existing non-blocking warnings.

- [ ] **Step 3: Inspect scope**

Run:

```powershell
git diff --check
rg -n "gemini-3.5-flash|Gemini 生图备用通道" src/components/SettingsDialog.tsx src/components/SettingsDialog.test.tsx src/domain/aiClient.test.ts
```

Expected: the new model appears only in the text model option/mapping tests; image fallback options and routing are unchanged.

- [ ] **Step 4: Leave changes local**

Do not commit, push, or deploy. Synchronize only when the user explicitly says `同步更新`.
