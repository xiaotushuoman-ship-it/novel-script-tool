# Storyboard Director Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade step 6 from a single 15S short-drama storyboard tool into a multi-mode storyboard director that supports general narrative, manju/comic storyboard, fight scenes, dance shots, and e-commerce product showcases.

**Architecture:** Keep one entry point in step 6, but add a `storyboardType` mode selector that swaps prompt skeletons and output framing while reusing the same generation, preview, download, and clear pipeline. The UI should feel like one production tool with modes, not several disconnected features. Prompt generation will become a two-layer system: a shared global storyboard contract plus a mode-specific shot grammar.

**Tech Stack:** React, TypeScript, Vite, Vitest, existing AI prompt builder and image-generation flow.

---

## File Map

- Modify: `src/domain/templates.ts` - add the new storyboard mode field, mode-specific prompt skeletons, and updated step-6 output contract.
- Modify: `src/domain/templates.test.ts` - lock the new mode selector, mode output shapes, and prompt requirements.
- Modify: `src/components/Workspace.tsx` - render the new mode control and make the step-6 panel label/output copy more generic.
- Modify: `src/components/Workspace.test.tsx` - cover the new UI control, mode switching, and the unchanged preview/download behavior.
- Optional modify later: `src/styles.css` - only if the new selector or controls need layout tightening after the logic lands.

---

### Task 1: Add storyboard mode selection to the step-6 template

**Files:**
- Modify: `src/domain/templates.ts`
- Test: `src/domain/templates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("exposes storyboard type options for step 6", () => {
  const template = getTemplate("gpt-image2-storyboard");
  const fields = Object.fromEntries(template.fields.map((field) => [field.key, field]));

  expect(fields.storyboardType.control).toBe("select");
  expect(fields.storyboardType.options).toEqual([
    "通用叙事",
    "漫剧分镜",
    "打斗",
    "舞蹈",
    "电商展示",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/templates.test.ts`
Expected: FAIL because `storyboardType` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add a new required select field on `gpt-image2-storyboard`:

```ts
{
  key: "storyboardType",
  label: "故事板类型",
  defaultValue: "通用叙事",
  required: true,
  control: "select",
  options: ["通用叙事", "漫剧分镜", "打斗", "舞蹈", "电商展示"],
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/domain/templates.test.ts`
Expected: PASS for the new test.

- [ ] **Step 5: Commit**

```bash
git add src/domain/templates.ts src/domain/templates.test.ts
git commit -m "feat: add storyboard mode selector"
```

---

### Task 2: Rewrite the step-6 prompt skeleton around mode-aware storyboard grammar

**Files:**
- Modify: `src/domain/templates.ts`
- Test: `src/domain/templates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("builds mode-specific storyboard prompts for the new director modes", () => {
  const prompt = buildPrompt(getTemplate("gpt-image2-storyboard"), {
    sourceText: "夜市摊前，主角抬手挡住冲来的对手。",
    boardCount: "2",
    imageRatio: "16:9",
    imageModel: "gpt-image-2",
    imageResolution: "1K",
    visualStyle: "3D国漫风格",
    panelLayout: "四宫格2x2",
    storyboardType: "打斗",
  });

  expect(prompt).toContain("故事板类型：打斗");
  expect(prompt).toContain("站位");
  expect(prompt).toContain("动作节拍");
  expect(prompt).toContain("受力点");
  expect(prompt).toContain("冲击反馈");
  expect(prompt).toContain("不要把四格画成四个无关场景");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/domain/templates.test.ts`
Expected: FAIL because the template body does not yet know about `storyboardType`.

- [ ] **Step 3: Write minimal implementation**

Refactor the step-6 template body so it has:
- a shared storyboard contract
- a `storyboardType` input in the prompt
- mode-specific grammar blocks for `通用叙事`, `漫剧分镜`, `打斗`, `舞蹈`, `电商展示`
- a unified output contract that still yields one story-board prompt per group

Keep the existing fields `boardCount`, `imageRatio`, `imageModel`, `imageResolution`, `visualStyle`, and `panelLayout`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/domain/templates.test.ts`
Expected: PASS for the new prompt-shape test.

- [ ] **Step 5: Commit**

```bash
git add src/domain/templates.ts src/domain/templates.test.ts
git commit -m "feat: make step 6 mode-aware"
```

---

### Task 3: Update the step-6 UI to present the mode selector as a production tool

**Files:**
- Modify: `src/components/Workspace.tsx`
- Test: `src/components/Workspace.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it("renders a storyboard type selector in step 6 and keeps the result tools intact", () => {
  const project = createProject("故事板导演器测试");
  project.currentStep = "gpt-image2-storyboard";

  render(
    <Workspace
      aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
      project={project}
      onAiSettingsChange={() => undefined}
      onProjectChange={() => undefined}
      onSaveVersion={() => undefined}
    />,
  );

  expect(screen.getByRole("combobox", { name: "故事板类型" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "生成故事板图片" })).toBeInTheDocument();
  expect(screen.getByText("故事板出图区")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Workspace.test.tsx`
Expected: FAIL until the new field is rendered and the copy is updated.

- [ ] **Step 3: Write minimal implementation**

Render `storyboardType` alongside the current step-6 controls and rename the panel copy to generic storyboard language. Keep preview/download/clear behavior unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/Workspace.test.tsx`
Expected: PASS for the step-6 UI test.

- [ ] **Step 5: Commit**

```bash
git add src/components/Workspace.tsx src/components/Workspace.test.tsx
git commit -m "feat: expose storyboard director mode in UI"
```

---

### Task 4: Keep image output and export behavior stable while the new modes ship

**Files:**
- Modify: `src/components/Workspace.tsx`
- Test: `src/components/Workspace.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it("keeps storyboard preview, download, and clear behavior unchanged after mode switching", async () => {
  const project = createProject("故事板结果稳定性测试");
  project.currentStep = "gpt-image2-storyboard";
  project.steps["gpt-image2-storyboard"].draft = "GPT-image-2出图提示词：一张四宫格故事板图。";

  render(
    <Workspace
      aiSettings={{ endpoint: "https://timeai.chat/v1", apiKey: "sk-test", model: "gpt-5.5" }}
      project={project}
      onAiSettingsChange={() => undefined}
      onProjectChange={() => undefined}
      onSaveVersion={() => undefined}
    />,
  );

  expect(screen.getByRole("button", { name: "生成故事板图片" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "一键清除" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "导出 TXT" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/Workspace.test.tsx`
Expected: FAIL only if the refactor accidentally breaks the output tools.

- [ ] **Step 3: Write minimal implementation**

Adjust only the text/panel logic needed for the new mode selector; preserve existing result cards, preview modal, download, and clear handlers.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/Workspace.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Workspace.tsx src/components/Workspace.test.tsx
git commit -m "test: preserve storyboard output tools"
```

---

### Task 5: Final verification and release prep

**Files:**
- Modify: none unless test fallout reveals a styling-only fix

- [ ] **Step 1: Run the focused tests**

Run:
```bash
npm test -- src/domain/templates.test.ts
npm test -- src/components/Workspace.test.tsx
```
Expected: both pass.

- [ ] **Step 2: Run a production build**

Run:
```bash
npm run build
```
Expected: build succeeds with no TypeScript or Vite errors.

- [ ] **Step 3: Commit any final cleanup**

```bash
git add .
git commit -m "chore: finalize storyboard director upgrade"
```

---

## Coverage Check

- Step-6 mode selection: Task 1, Task 3
- Mode-aware prompt generation: Task 2
- UI stays production-friendly and unified: Task 3
- Preview/download/clear safety: Task 4
- Verification and build stability: Task 5

## Risks / Watchouts

- The prompt body is large, so keep each insertion scoped and avoid reformatting unrelated templates.
- The step-6 template already has many fields; mode logic should stay additive, not a rewrite of all existing storyboard controls.
- Keep the result area generic enough to cover narrative, manju, action, dance, and e-commerce without forcing separate screens.