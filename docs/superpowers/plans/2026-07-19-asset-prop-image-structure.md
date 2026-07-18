# Asset Prop Image Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a step-3 prop image structure selector so item extraction can generate either four-view ecommerce product sheets or the existing single-product white-background image, with prop visuals following the selected style anchor.

**Architecture:** The asset-extraction template owns the new `propImageStructure` field and tells the LLM which prop layout to output. `Workspace.tsx` conditionally shows the field only when `assetType` is `物品`, keeps prop visual styles unmodified, and maps the selected structure into the image-generation prompt. Existing people and scene logic remains unchanged.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing prompt template system.

---

### Task 1: Add Tests For Prop Structure UI And Prompt

**Files:**
- Modify: `src/components/Workspace.test.tsx`

- [ ] **Step 1: Write the failing test for the new prop selector and default four-view prompt**

Add or extend the existing `物品出图约束测试` case so a prop extraction project with `assetType: "物品"`, `visualStyle: "现代甜酷3D乙游"`, and no explicit `propImageStructure` shows the `物品图片结构` combobox and produces a prompt containing:

```ts
expect(screen.getByRole("combobox", { name: "物品图片结构" })).toHaveValue("四视电商图");
expect(callImageGenerationMock.mock.calls[1][1]).toContain("物品四视电商图");
expect(callImageGenerationMock.mock.calls[1][1]).toContain("1.左上：正面产品图");
expect(callImageGenerationMock.mock.calls[1][1]).toContain("2.右上：侧面产品图");
expect(callImageGenerationMock.mock.calls[1][1]).toContain("3.左下：背面产品图");
expect(callImageGenerationMock.mock.calls[1][1]).toContain("4.右下：俯视产品图");
expect(callImageGenerationMock.mock.calls[1][1]).toContain("四格必须是同一物品、同一比例、同一材质、同一光影、同一画风锚点");
expect(callImageGenerationMock.mock.calls[1][1]).toContain("指定画风：现代甜酷3D乙游");
expect(callImageGenerationMock.mock.calls[1][1]).not.toContain("指定画风：3D国漫风格");
```

- [ ] **Step 2: Write the failing test for single-product fallback**

Create a second prop project with `propImageStructure: "单张电商图"`; assert its prompt keeps the original white-background single-product language and does not include four-view panel labels:

```ts
expect(callImageGenerationMock.mock.calls[0][1]).toContain("单张电商图");
expect(callImageGenerationMock.mock.calls[0][1]).toContain("纯道具产品图，居中展示，纯白背景");
expect(callImageGenerationMock.mock.calls[0][1]).not.toContain("1.左上：正面产品图");
```

- [ ] **Step 3: Run the focused tests to verify RED**

Run: `npm test -- src/components/Workspace.test.tsx`

Expected: FAIL because the combobox does not exist and four-view prompt strings are missing.

### Task 2: Add Template Field And Prompt Routing

**Files:**
- Modify: `src/domain/templates.ts`
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Add the template field**

In `asset-extraction.fields`, after `assetType`, add:

```ts
{
  key: "propImageStructure",
  label: "物品图片结构",
  defaultValue: "四视电商图",
  control: "select",
  options: ["四视电商图", "单张电商图"],
},
```

- [ ] **Step 2: Include the selected prop structure in the LLM prompt**

In `asset-extraction.body`, add input context:

```text
- 物品图片结构：{{propImageStructure}}
```

Replace the current `物品输出为` line with language that tells the model:

```text
- 物品输出为：【物品】物品名称：当物品图片结构为“四视电商图”时，必须使用物品四视电商图，固定2X2布局，纯白背景，左上正面产品图、右上侧面产品图、左下背面产品图、右下俯视产品图；四格必须是同一物品、同一比例、同一材质、同一光影、同一画风锚点{{visualStyle}}，只展示物品本身的外形、材质、颜色、尺寸感、磨损状态和功能。当物品图片结构为“单张电商图”时，使用单张电商纯白背景产品图，居中展示。两种结构都不要人物、不要手持、不要场景环境、不要生活背景、不要文字、不要字幕、不要水印、不要logo。
```

Update the object example to mention the four-view layout.

- [ ] **Step 3: Hide the field unless extracting props**

In `Workspace.tsx` field rendering, skip `propImageStructure` unless `project.currentStep === "asset-extraction" && step.inputs.assetType === "物品"`.

- [ ] **Step 4: Let props keep selected visual style**

Change `normalizeAssetVisualStyle` so only `场景` filters character-only styles; `物品` returns the selected style unchanged.

Update the select options filter similarly:

```ts
project.currentStep === "asset-extraction" && field.key === "visualStyle" && assetType === "场景"
```

### Task 3: Add Image Prompt Branches For Prop Structures

**Files:**
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Read `propImageStructure` inside `buildAssetImagePrompt`**

Add:

```ts
const propImageStructure = (inputs.propImageStructure || "四视电商图").trim();
```

- [ ] **Step 2: Replace the prop prompt array with conditional layout instructions**

For `assetType === "物品"`, output:

```ts
...(assetType === "物品"
  ? propImageStructure === "单张电商图"
    ? [
        "物品图片结构：单张电商图。",
        "物品统一后缀：电商纯白色背景强约束。",
        "物品格式：纯道具产品图，居中展示，纯白背景，白底棚拍，柔和商品光；材质、光影、色彩和造型语言必须跟随当前画风锚点，不得固定成写实摄影风。",
        "物品要求：只展示物品本身的外形、材质、颜色、尺寸感、磨损状态和功能；不要人物、不要手持、不要场景环境、不要生活背景、不要文字、不要字幕、不要水印、不要logo。",
      ]
    : [
        "物品图片结构：四视电商图。",
        "物品统一后缀：物品四视电商图，电商纯白色背景强约束。",
        "版式要求：固定2X2布局，四个画面都必须展示同一件物品，不是四个不同物品，不是场景图；四格必须是同一物品、同一比例、同一材质、同一光影、同一画风锚点。",
        "1.左上：正面产品图，展示物品正面轮廓、主材质、核心装饰和尺寸感。",
        "2.右上：侧面产品图，展示物品厚度、侧边结构、接口、刀刃/把手/盖口等侧向细节。",
        "3.左下：背面产品图，展示背部轮廓、背面材质、背面磨损、固定件或隐藏结构。",
        "4.右下：俯视产品图，从正上方展示顶部轮廓、开口、纹理、按键、铭牌、刀背或摆放形态。",
        `风格锚点锁定：四格的材质、光影、色彩、线条、建模或渲染方式必须跟随“${visualStyle}”，纯白背景和电商棚拍只控制背景与展示方式，不得覆盖画风锚点。`,
        "物品要求：只展示物品本身的外形、材质、颜色、尺寸感、磨损状态和功能；不要人物、不要手持、不要场景环境、不要生活背景、不要文字、不要字幕、不要水印、不要logo、不要编号、不要面板标题。",
      ]
  : []),
```

- [ ] **Step 3: Run the focused tests to verify GREEN**

Run: `npm test -- src/components/Workspace.test.tsx`

Expected: PASS.

### Task 4: Full Verification

**Files:**
- No code changes.

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all test files pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: exit code 0. Existing Vite chunk-size or missing optional model thumbnail warnings are acceptable only if build succeeds.

---

## Self-Review

- Spec coverage: The plan adds a visible prop structure selector, defaults to four-view ecommerce, preserves a single-product option, and makes prop style follow the selected visual anchor.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: The new input key is consistently `propImageStructure` and values are `四视电商图` / `单张电商图`.
