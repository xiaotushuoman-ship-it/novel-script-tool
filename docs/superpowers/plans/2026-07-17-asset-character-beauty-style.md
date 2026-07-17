# Asset Character Beauty and Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve step 3 character extraction so important characters receive distinctive lead-quality designs while every character and generated image remains strictly aligned with the selected visual style.

**Architecture:** Keep the existing prompt-building pipeline. Expand `buildAssetCharacterStyleRule()` into a role-tiered character-design rule plus style-specific rendering branches, and strengthen the character-only image-generation suffix so extracted beauty details survive the second image prompt. Scene and prop prompts remain unchanged.

**Tech Stack:** TypeScript, React, Vitest, Testing Library

---

### Task 1: Lock the role-tiered extraction behavior with tests

**Files:**
- Modify: `src/domain/templates.test.ts`
- Test: `src/domain/templates.test.ts`

- [ ] **Step 1: Add a failing 3D Guoman lead-quality test**

Add assertions to the existing asset-character tests requiring the built prompt to contain:

```ts
expect(assetOutputRules).toContain("男女主角、核心反派和重要配角使用主角级美型标准");
expect(assetOutputRules).toContain("清雅、飒爽、温婉、冷艳、明艳等气质必须由剧情决定");
expect(assetOutputRules).toContain("次表面散射");
expect(assetOutputRules).toContain("PBR织物材质");
```

- [ ] **Step 2: Add a failing special-role protection test**

Require the prompt to protect ordinary supporting roles, elderly people, children, and sick characters from the lead template:

```ts
expect(assetOutputRules).toContain("普通成年配角保持协调、自然、有辨识度");
expect(assetOutputRules).toContain("老人、儿童、病弱者及特殊身份角色");
expect(assetOutputRules).toContain("不得套用年轻主角体态、华丽服饰或高开衩设计");
```

- [ ] **Step 3: Add failing non-3D style isolation assertions**

For the water-ink prompt slice, assert that 3D-only rendering language is absent while style-specific language remains:

```ts
expect(assetOutputRules).not.toContain("次表面散射");
expect(assetOutputRules).not.toContain("PBR织物材质");
expect(assetOutputRules).toContain("水墨国风动画对应的材质、线条、色彩、光影和角色设计语言");
```

- [ ] **Step 4: Run focused tests and verify RED**

Run: `npm test -- src/domain/templates.test.ts`

Expected: FAIL because the new role-tier and rendering phrases are not yet emitted.

### Task 2: Implement role-tiered beauty and dynamic style rules

**Files:**
- Modify: `src/domain/templates.ts:887`
- Modify: `src/domain/templates.ts:1774`
- Test: `src/domain/templates.test.ts`

- [ ] **Step 1: Replace the universal adult-female template with role tiers**

Update the shared character-design text so it explicitly distinguishes:

```ts
const adaptiveCharacterDesign =
  "男女主角、核心反派和重要配角使用主角级美型标准：脸型、骨相、眉眼、鼻唇、肤质、发型、气场和身份细节必须精致鲜明，并各自拥有独立记忆点，不能是大众脸，也不能互相撞脸。原文明确定义为成年女性且属于女主角、重要女性反派或核心女性配角时，在不违背年龄、身份、时代和剧情的前提下，使用骨肉匀称、线条流畅、眉眼灵动、眼神体现性格与剧情张力、体态优美且比例协调的美型标准；鼻唇、肤质、发型、配饰和服装均写出可视化细节。清雅、飒爽、温婉、冷艳、明艳等气质必须由剧情决定，不得把所有女性固定成同一张佳人模板。服装按时代、身份、阶层和场景精细设计，写清剪裁、面料、颜色层次、纹样、配饰和鞋履，华丽程度服从角色身份。普通成年配角保持协调、自然、有辨识度，不强制套用男女主角的精致模板。老人、儿童、病弱者及特殊身份角色必须按年龄和剧情塑造，不得套用年轻主角体态、华丽服饰或高开衩设计。男性角色的肩背、腰身、肌肉量和站姿必须服从年龄、身份、职业、时代与剧情。所有角色不得模仿现实明星、网红、艺人或博主。";
```

- [ ] **Step 2: Enrich only the 3D Guoman rendering branch**

Add high-end rendering language only to `visualStyle === "3D国漫风格"`:

```ts
"次世代高精度建模、精细角色雕刻、细腻半透明次表面散射、根根分明的发丝、顶级PBR织物材质、清晰面料纹理和精致刺绣"
```

Keep other 3D, realistic, and non-3D branches free from incompatible terms.

- [ ] **Step 3: Strengthen the template's character-only extraction instructions**

Update the character extraction section to state that character role importance controls beauty/detail level, while the selected visual style controls rendering vocabulary. Preserve the existing three-view layout and full-character extraction behavior.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/domain/templates.test.ts`

Expected: PASS.

### Task 3: Preserve lead-quality details in the image-generation request

**Files:**
- Modify: `src/components/Workspace.test.tsx`
- Modify: `src/components/Workspace.tsx:2991`
- Test: `src/components/Workspace.test.tsx`

- [ ] **Step 1: Add a failing character image-prompt test**

Extend the existing character prompt test with:

```ts
expect(prompt).toContain("角色美型要求：严格保留该资产提取内容中的角色等级");
expect(prompt).toContain("风格材质只能由当前画风锚点决定");
expect(prompt).toContain("不得把普通配角、老人、儿童或病弱角色强行主角化");
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/Workspace.test.tsx -t "builds a strict image prompt"`

Expected: FAIL because the new image-prompt guard is absent.

- [ ] **Step 3: Add the character-only image prompt guard**

Inside the existing `assetType === "人物"` suffix, add:

```ts
"角色美型要求：严格保留该资产提取内容中的角色等级、原创五官、气质、体态、发型、服装和身份记忆点；男女主、核心反派和重要配角保持主角级精致度，普通配角与特殊年龄角色保持剧情真实度，不得把普通配角、老人、儿童或病弱角色强行主角化。风格材质只能由当前画风锚点决定。"
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/components/Workspace.test.tsx -t "builds a strict image prompt"`

Expected: PASS.

### Task 4: Full verification

**Files:**
- Verify: `src/domain/templates.ts`
- Verify: `src/domain/templates.test.ts`
- Verify: `src/components/Workspace.tsx`
- Verify: `src/components/Workspace.test.tsx`

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all Vitest suites pass with zero failures.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: TypeScript and Vite build exit with code 0.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check && git diff -- src/domain/templates.ts src/domain/templates.test.ts src/components/Workspace.tsx src/components/Workspace.test.tsx`

Expected: no whitespace errors; only step 3 character extraction and character image-prompt behavior change.

- [ ] **Step 4: Do not push automatically**

Leave changes local until the user explicitly requests `同步更新`.
