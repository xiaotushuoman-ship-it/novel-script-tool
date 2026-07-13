# Adaptive Short-Drama Script Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make step 1 produce genre-adaptive, complete, shootable short-drama scripts while keeping its existing chapter-count and chapter-word controls.

**Architecture:** Replace only the `outline-expansion` prompt contract in the shared template registry. Preserve its existing fields and interpolation variables, but replace novel-only and urban-default instructions with internal genre routing and script-only output requirements. The existing prompt builder and streaming UI remain unchanged.

**Tech Stack:** TypeScript, Vitest, React, Vite

---

### Task 1: Define the step 1 prompt behavior in tests

**Files:**
- Modify: `src/domain/templates.test.ts`
- Test: `src/domain/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the old step 1 expectations that require visible `95分` output. Add this test after the current step 1 missing-outline-details test:

```ts
it("builds genre-adaptive short-drama scripts without exposing internal checks", () => {
  const template = getTemplate("outline-expansion");
  const prompt = buildPrompt(template, {
    outline: "沈知意被逼嫁入侯府，却在洞房前发现未婚夫与长姐联手夺她兵符。",
    totalChapters: "20",
    chapterWords: "2500",
    style: "古风权谋",
    perspective: "第三人称",
    autoContinue: "完结",
  });

  expect(prompt).toContain("总章数：20");
  expect(prompt).toContain("单章目标字数：2500");
  expect(prompt).toContain("都市爽文");
  expect(prompt).toContain("情感女频");
  expect(prompt).toContain("古风权谋");
  expect(prompt).toContain("古风情感");
  expect(prompt).toContain("场次标题");
  expect(prompt).toContain("画面/动作");
  expect(prompt).toContain("台词");
  expect(prompt).toContain("音效/氛围");
  expect(prompt).toContain("内部完成");
  expect(prompt).toContain("不得输出自检");
  expect(prompt).toContain("第一句话");
  expect(prompt).not.toContain("本章自评分：95+");
  expect(prompt).not.toContain("自动补全设定");
});
```

Update the existing `fills one-click novel generation variables` test to remove `expect(prompt).toContain("95分")` and replace it with:

```ts
expect(prompt).toContain("完整短剧剧本");
expect(prompt).not.toContain("本章自评分：95+");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/domain/templates.test.ts`

Expected: FAIL because step 1 currently requires novel prose, visible self-ratings, and does not contain the required all-genre script contract.

### Task 2: Replace the step 1 prompt contract

**Files:**
- Modify: `src/domain/templates.ts`
- Test: `src/domain/templates.test.ts`

- [ ] **Step 1: Replace the step 1 role and output rules**

In the `outline-expansion` template, replace the current novel-only `body` string with a short-drama script contract that retains these interpolated parameters:

```text
- 总章数：{{totalChapters}}
- 单章目标字数：{{chapterWords}}
- 叙事视角：{{perspective}}
- 文风基调：{{style}}
- 创作模式：{{autoContinue}}
```

The replacement must require internal genre identification covering `都市爽文`、`情感女频`、`古风权谋`、`古风情感` and other outline-supported genres. It must explicitly prohibit forcing modern commercial details, folk disputes, modern dialogue, or urban settings into mismatched genres.

- [ ] **Step 2: Require script-only finished output**

Add an output contract that requires this exact visible structure:

```text
【制作规格】
总章数：{{totalChapters}}
单章目标字数：{{chapterWords}}
故事类型与时代背景：根据大纲和文风自动确定
输出范围：本次覆盖第1章到最终章；单次长度不足时写清当前覆盖章节并保持后续编号连续
完结状态：按{{autoContinue}}执行

【第1章：章节名】
【第1场｜内/外景｜地点｜时间】
画面/动作：
角色名（语气/动作）："台词"
音效/氛围：
```

Require every chapter to begin immediately with a genre-appropriate spoken or narrated conflict hook and end with a concrete shootable question, reversal, threat, evidence, choice, or emotional turn.

- [ ] **Step 3: Hide internal reasoning and self-checks**

Require internal checks for outline fidelity, genre consistency, causal continuity, dialogue naturalness, retention, and platform safety. Add an explicit output prohibition:

```text
内部完成上述判断、自检与改写；不得输出自检、评分、爆点拆解、赛道分析、合规说明、工作流说明、自动补全设定或思考过程。
```

- [ ] **Step 4: Make outline completion genre-safe**

Replace the current fixed missing-detail list with instructions to preserve all explicit source facts and infer only missing details that fit the selected genre. Include examples as conditional rather than defaults: modern stories may use work, money, evidence, or reputation pressure; romance may use relationship choices and boundaries; ancient stories may use factions, status, alliances, secrets, or strategic consequences. Do not require inherited assets, family conflict, county settings, or modern commercial artifacts unless the source supports them.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm test -- src/domain/templates.test.ts`

Expected: all template tests PASS.

### Task 3: Verify the application

**Files:**
- Modify: `src/domain/templates.ts`
- Test: `src/domain/templates.test.ts`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all test files and tests PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript compilation and Vite production build PASS.

- [ ] **Step 3: Inspect the final scope**

Run: `git diff --check` and `git diff -- src/domain/templates.ts src/domain/templates.test.ts`

Expected: only step 1 prompt rules and its focused tests change; existing fields, steps 2 and 10, and UI code remain unchanged.

- [ ] **Step 4: Leave changes local**

Do not commit or push. Synchronize only after the user explicitly says `同步更新`.
