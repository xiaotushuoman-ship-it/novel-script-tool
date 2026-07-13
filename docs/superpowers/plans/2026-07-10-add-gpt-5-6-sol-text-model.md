# Add `gpt-5.6-sol` Text Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `gpt-5.6-sol` selectable by every text-generation feature while preserving `gpt-5.5` as the default.

**Architecture:** Extend the existing shared text model option list in `SettingsDialog`; all text features already consume the selected `AiSettings.model`, and `aiClient` forwards that model ID unchanged. Verify the UI option and unchanged default with a focused component test.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite

---

### Task 1: Add the shared text model option

**Files:**
- Modify: `src/components/SettingsDialog.tsx`
- Test: `src/components/SettingsDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test to `SettingsDialog.test.tsx`:

```tsx
it("includes gpt-5.6-sol while keeping gpt-5.5 selected by default", () => {
  render(
    <SettingsDialog
      open
      settings={DEFAULT_AI_SETTINGS}
      onChange={() => undefined}
      onClose={() => undefined}
    />,
  );

  expect(screen.getByRole("option", { name: "gpt-5.6-sol" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "模型名" })).toHaveValue("gpt-5.5");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/SettingsDialog.test.tsx`

Expected: FAIL because no option named `gpt-5.6-sol` exists.

- [ ] **Step 3: Add the model to the shared list**

Update `TEXT_MODEL_OPTIONS` in `SettingsDialog.tsx`:

```tsx
const TEXT_MODEL_OPTIONS = [
  "gpt-5.5",
  "gpt-5.6-sol",
  "gemini-3.1-pro-preview",
  "deepseek-v4-pro",
  "qwen3.7-plus",
  "claude-opus-4-8",
];
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/components/SettingsDialog.test.tsx`

Expected: all `SettingsDialog` tests PASS.

- [ ] **Step 5: Run full verification**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run build`

Expected: TypeScript and Vite production build PASS.

- [ ] **Step 6: Leave changes local**

Do not commit or push. The user will explicitly request `同步更新` when deployment is wanted.
