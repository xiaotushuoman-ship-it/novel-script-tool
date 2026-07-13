# 第1项编剧级对白系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade step 1 dialogue generation so novel and short-drama content automatically use distinctive, natural, plot-driving character voices without exposing internal analysis.

**Architecture:** Keep the existing step 1 UI and streaming pipeline unchanged. Add a reusable dialogue-director rule block to the step 1 template, then explicitly carry the same rules into continuation and chapter-revision prompts so character voice remains stable after the first generation.

**Tech Stack:** TypeScript, React, Vitest, Vite

---

### Task 1: Lock the main step 1 dialogue contract

**Files:**
- Modify: `src/domain/templates.test.ts`
- Modify: `src/domain/templates.ts`

- [ ] **Step 1: Write failing prompt assertions**

Extend the existing `configures one-click novel generation as a complete short-drama script workflow` test with assertions covering the new dialogue system:

```ts
expect(prompt).toContain("小说叙事模式与短剧表达模式自动判断");
expect(prompt).toContain("人物语言指纹");
expect(prompt).toContain("姓名互换测试");
expect(prompt).toContain("潜台词");
expect(prompt).toContain("施压、试探、遮掩、套话、拒绝、交易、暴露、误判、反击、关系变化或行动决定");
expect(prompt).toContain("你听我解释");
expect(prompt).toContain("事情不是你想的那样");
expect(prompt).toContain("都市爽文");
expect(prompt).toContain("情感女频");
expect(prompt).toContain("古风权谋");
expect(prompt).toContain("古风情感");
expect(prompt).toContain("0-2秒");
expect(prompt).toContain("2-5秒");
expect(prompt).not.toContain("输出人物语言指纹");
expect(prompt).not.toContain("输出姓名互换测试结果");
```

- [ ] **Step 2: Run the focused template test and verify RED**

Run: `npm test -- src/domain/templates.test.ts`

Expected: FAIL because the step 1 prompt does not yet contain the dialogue-director contract.

- [ ] **Step 3: Add a reusable dialogue-director rule block**

In `src/domain/templates.ts`, add a constant near the other prompt-rule constants:

```ts
const OUTLINE_DIALOGUE_DIRECTOR_RULES = `# 编剧级对白导演系统
1. 小说叙事模式与短剧表达模式自动判断：小说正文让对白与动作、观察、心理反应自然交织；短剧表达让对白更短、更具行动性，第一轮就制造冲突和追看问题。
2. 在内部为每个主要人物建立稳定的人物语言指纹：常用词、句长、停顿方式、称呼习惯、礼貌程度、攻击方式、回避方式和情绪失控点必须有区别，并贯穿所有章节。
3. 执行姓名互换测试：如果两个主要人物的台词互换后仍然自然成立，说明声音同质化，必须重写，且不得把测试过程或结果输出给用户。
4. 重要对白必须有目的和潜台词。每轮至少完成施压、试探、遮掩、套话、拒绝、交易、暴露、误判、反击、关系变化或行动决定中的一项，不得只复述背景。
5. 可以使用打断、抢话、沉默、答非所问、改口和话留半句，但必须服务人物关系和剧情，不能机械套用或故意写得支离破碎。
6. 禁止万能模板句和空狠话，包括“你听我解释”“事情不是你想的那样”“我一定不会放过你”“你会后悔的”；确有剧情必要时必须改成符合人物身份和当前利益的具体表达。
7. 都市爽文使用生活化、克制、带利益和规则意识的语言；情感女频通过边界、关系选择和未说出口的需求推进；古风权谋通过身份、礼法、阵营、承诺和试探交锋；古风情感含蓄但清楚；其他题材遵循世界规则，不套同一种现代爽剧口吻。
8. 开头第一句话必须制造具体矛盾、反常事实、证据、利益冲突或关系危机；0-2秒出现异常，2-5秒明确谁想得到什么、谁在阻止，以及为什么必须继续看。
9. 内部删除不推动事件、不暴露信息、不改变关系的空对白；发现模板腔、解释腔、总结腔、作者借人物说教或所有人同一种语气时，必须重写。
10. 最终结果只输出完整成品，不得输出人物语言指纹、对白策略、姓名互换测试、自检、评分或重写说明。`;
```

Insert `${OUTLINE_DIALOGUE_DIRECTOR_RULES}` into the `outline-expansion` prompt after the adaptive genre rules and before the core generation rules, so genre selection informs dialogue style.

- [ ] **Step 4: Run the focused template test and verify GREEN**

Run: `npm test -- src/domain/templates.test.ts`

Expected: all template tests PASS.

### Task 2: Preserve dialogue quality in continuation and revision

**Files:**
- Modify: `src/components/Workspace.test.tsx`
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Write failing continuation and revision assertions**

Extend the existing step 1 continuation test:

```ts
expect(callAiStreamMock.mock.calls[0][1]).toContain("继承前文主要人物的语言指纹");
expect(callAiStreamMock.mock.calls[0][1]).toContain("姓名互换后仍成立的台词必须重写");
expect(callAiStreamMock.mock.calls[0][1]).toContain("不得用对白复述前文");
```

Extend the existing single-chapter revision test:

```ts
expect(callAiStreamMock.mock.calls[0][1]).toContain("机械对白");
expect(callAiStreamMock.mock.calls[0][1]).toContain("人物声音同质化");
expect(callAiStreamMock.mock.calls[0][1]).toContain("潜台词");
expect(callAiStreamMock.mock.calls[0][1]).toContain("万能模板句");
```

- [ ] **Step 2: Run the focused Workspace tests and verify RED**

Run: `npm test -- src/components/Workspace.test.tsx -t "续写|单章优化"`

Expected: FAIL because continuation and revision prompts currently use generic dialogue guidance.

- [ ] **Step 3: Strengthen the continuation prompt**

In `runNovelContinuation`, add these lines before the output requirement:

```ts
"对白连续性：继承前文主要人物的语言指纹，包括词汇、句长、称呼、礼貌程度、攻击/回避方式和情绪失控点；不能在续写中突然换成同一种AI口吻。",
"对白推进：每轮重要对话必须推动事件、暴露信息、改变关系或迫使人物做选择；不得用对白复述前文或解释双方都知道的信息。",
"对白质检：姓名互换后仍成立的台词必须重写；删除万能狠话、机械问答、说明书腔和不影响剧情的空对白。",
```

- [ ] **Step 4: Strengthen the chapter-revision prompt**

Replace the generic revision focus line with:

```ts
"优化重点：强钩子、冲突压迫、爽点递进、人物动机、结尾留钩、减少废话；重点重写机械对白、人物声音同质化、缺少潜台词、剧情复述、万能模板句和作者说教。",
"对白要求：保持人物既有身份与关系，使用具体目的、信息差、试探、回避、改口、动作和停顿推进；姓名互换后仍成立的台词必须重写。",
```

- [ ] **Step 5: Run the focused Workspace tests and verify GREEN**

Run: `npm test -- src/components/Workspace.test.tsx -t "续写|单章优化"`

Expected: focused continuation and revision tests PASS.

### Task 3: Verify the application

**Files:**
- Modify: `src/domain/templates.ts`
- Modify: `src/domain/templates.test.ts`
- Modify: `src/components/Workspace.tsx`
- Modify: `src/components/Workspace.test.tsx`

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all tests PASS, including existing streaming, chapter count, prompt fidelity, DOCX import, step 10 batching, and director-desk tests.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite production build PASS. Existing non-blocking asset-path and bundle-size warnings may remain.

- [ ] **Step 3: Inspect scope and prompt leakage**

Run:

```powershell
git diff --check
rg -n "人物语言指纹|姓名互换测试|万能模板句|潜台词" src/domain/templates.ts src/components/Workspace.tsx
```

Expected: dialogue rules appear only in step 1 generation, continuation, and revision prompt construction; no UI control or result-cleaning behavior changes.

- [ ] **Step 4: Leave changes local**

Do not commit, push, or deploy. Synchronize only when the user explicitly says `同步更新`.
