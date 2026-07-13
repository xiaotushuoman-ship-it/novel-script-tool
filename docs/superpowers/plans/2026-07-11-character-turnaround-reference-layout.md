# Character Turnaround Reference Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace step 3 character extraction and character image generation with a white-background portrait-plus-turnaround layout, removing the old 2x2 character suffix.

**Architecture:** Update the character-only instructions in the asset extraction template and the character branch of `buildImageGenerationPrompt`. Preserve shared character description, clothing, face originality, style-locking, scene, prop, storyboard, and custom-image behavior.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, Vite

---

### Task 1: Update character extraction layout

**Files:**
- Modify: `src/domain/templates.test.ts`
- Modify: `src/domain/templates.ts`

- [ ] **Step 1: Write failing template assertions**

In the asset extraction template test, replace the old 2x2 character assertions with:

```ts
expect(template.body).toContain("人物三视图生产参考图");
expect(template.body).toContain("纯白背景");
expect(template.body).toContain("上方三分之一为正面脸部近景头像");
expect(template.body).toContain("下方三分之二严格分成三个等比例竖向面板");
expect(template.body).toContain("颈部以下到脚部的正面、侧面、背面身体视图");
expect(template.body).toContain("下方三块不出现头部和五官");
expect(template.body).toContain("双手自然下垂");
expect(template.body).toContain("双脚完整可见");
expect(template.body).toContain("顶部头像与下方三视图必须是同一角色");
expect(template.body).not.toContain("【Layout】2x2 grid");
expect(template.body).not.toContain("FULL BODY NECK DOWN, NO FACE");
expect(template.body).not.toContain("左下格不露脸");
expect(template.body).not.toContain("必须使用2x2四宫格");
```

Keep the existing assertions for style anchoring, original faces, detailed clothing, scene extraction, prop extraction, and no visible labels.

- [ ] **Step 2: Run template tests and verify RED**

Run: `npm test -- src/domain/templates.test.ts`

Expected: FAIL because the template still contains the old 2x2 character structure.

- [ ] **Step 3: Replace both character structure paragraphs**

In `src/domain/templates.ts`, replace the required character `图片的结构` paragraph and the example paragraph with:

```text
图片的结构：人物三视图生产参考图，布局为纯白背景。上方三分之一为正面脸部近景头像；下方三分之二严格分成三个等比例竖向面板，依次展示从颈部以下到脚部的正面、侧面、背面身体视图。下方三块不出现头部和五官，双手自然下垂，双脚完整可见，三块比例一致、间距清楚。顶部头像与下方三视图必须是同一角色、同一服装、同一风格、同一光影，正侧背身体比例统一。不要字幕、水印、logo、编号、面板标题或多余文字。
```

Retain the existing visual-style-anchor sentence in the required output rule before or after this structure.

- [ ] **Step 4: Run template tests and verify GREEN**

Run: `npm test -- src/domain/templates.test.ts`

Expected: all template tests PASS.

### Task 2: Replace the character image generation suffix

**Files:**
- Modify: `src/components/Workspace.test.tsx`
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Write failing image prompt assertions**

Update both character image-generation tests to assert:

```ts
expect(prompt).toContain("人物三视图生产参考图");
expect(prompt).toContain("上方三分之一为正面脸部近景头像");
expect(prompt).toContain("下方三分之二严格分成三个等比例竖向面板");
expect(prompt).toContain("颈部以下到脚部的正面、侧面、背面身体视图");
expect(prompt).toContain("下方三块不出现头部和五官");
expect(prompt).toContain("双手自然下垂");
expect(prompt).toContain("双脚完整可见");
expect(prompt).toContain("优先遵循“该资产的提取内容”中的人物外貌、整体风格、人物身份和图片结构");
expect(prompt).not.toContain("人物统一后缀：2x2同一人角色设定图");
expect(prompt).not.toContain("FULL BODY NECK DOWN, NO FACE");
expect(prompt).not.toContain("Top-left");
```

Keep assertions that the extracted character card participates in the prompt and that fixed photographic style terms are not appended.

- [ ] **Step 2: Run focused Workspace tests and verify RED**

Run: `npm test -- src/components/Workspace.test.tsx`

Expected: FAIL because the generated character prompt still appends the old 2x2 suffix.

- [ ] **Step 3: Replace only the character prompt branch**

Replace the character-only suffix array in `buildImageGenerationPrompt` with these constraints:

```text
人物统一后缀：人物三视图生产参考图，纯白背景。
图片结构强制：上方三分之一为正面脸部近景头像；下方三分之二严格分成三个等比例竖向面板，依次展示从颈部以下到脚部的正面、侧面、背面身体视图。
下方身体视图要求：三块都不出现头部和五官，双手自然下垂，双脚完整可见，三块比例一致、间距清楚。
人物一致性要求：顶部头像与下方三视图必须是同一角色、同一服装、同一风格、同一光影，正侧背身体比例统一；优先遵循“该资产的提取内容”中的人物外貌、整体风格、人物身份和图片结构。
画面清洁要求：不要字幕、水印、logo、编号、面板标题、文字栏、表格线、说明卡片或多余文字。
```

Keep the existing style lock, clothing design, and original-face constraints. Remove only the old 2x2, quadrant, four-grid, and `FULL BODY NECK DOWN` instructions.

- [ ] **Step 4: Run focused Workspace tests and verify GREEN**

Run: `npm test -- src/components/Workspace.test.tsx`

Expected: all Workspace tests PASS.

### Task 3: Verify scope and application health

**Files:**
- Modify: `src/domain/templates.ts`
- Modify: `src/domain/templates.test.ts`
- Modify: `src/components/Workspace.tsx`
- Modify: `src/components/Workspace.test.tsx`

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite build PASS.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check` and inspect diffs for the four modified files.

Expected: character extraction and character image prompts use the new layout; scene and prop branches remain unchanged; `DEFAULT_CUSTOM_IMAGE_PREFIX`, storyboards, and custom-image behavior remain unchanged.

- [ ] **Step 4: Leave changes local**

Do not commit or push. Synchronize only when the user explicitly says `同步更新`.
