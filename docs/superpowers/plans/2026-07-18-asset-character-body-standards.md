# 第 3 项人物体态标准 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让第 3 项每个人物结果独立输出可执行的 `体态标准：`，并在人物生图时保留已有标准或根据角色线索可靠补全。

**Architecture:** 新增纯 TypeScript 体态规则模块，集中保存女性、古风男性、现代男性和例外角色标准，并提供结构化字段提取与漏写推断。模板域负责强制输出字段；Workspace 生图域只调用共享模块，将体态标准置于画风和三视图之前，场景与物品不调用该模块。

**Tech Stack:** TypeScript、React、Vitest、Testing Library、Vite

---

### Task 1: 建立共享体态规则与推断模块

**Files:**
- Create: `src/domain/assetCharacterBodyStandards.ts`
- Create: `src/domain/assetCharacterBodyStandards.test.ts`

- [ ] **Step 1: 写失败测试覆盖四类路由**

测试纯函数 `resolveAssetCharacterBodyStandard(description)`：

```ts
expect(resolveAssetCharacterBodyStandard("成年女性，都市珠宝设计师")).toContain("饱满S曲线");
expect(resolveAssetCharacterBodyStandard("成年男性，古风将军，束腰战袍")).toContain("标准宽肩窄腰");
expect(resolveAssetCharacterBodyStandard("成年男性，现代都市设计师，黑色西装")).toContain("宽肩阔背");
expect(resolveAssetCharacterBodyStandard("儿童，十岁男孩")).toContain("严格按原文年龄与身体状况塑造");
```

- [ ] **Step 2: 写已有字段与中性兜底失败测试**

```ts
expect(resolveAssetCharacterBodyStandard("体态标准：瘦高，轻微驼背\n人物的身份：账房先生"))
  .toBe("体态标准：瘦高，轻微驼背");
expect(resolveAssetCharacterBodyStandard("神秘来客，身份不明"))
  .toContain("正侧背比例一致");
```

同时测试已有 `体态标准` 可使用中文/英文冒号、分号或换行，并且提取后不重复。

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- src/domain/assetCharacterBodyStandards.test.ts`

Expected: FAIL，模块和函数尚不存在。

- [ ] **Step 4: 实现常量和纯函数**

模块导出：

```ts
export const ADULT_FEMALE_BODY_STANDARD: string;
export const ANCIENT_ADULT_MALE_BODY_STANDARD: string;
export const MODERN_ADULT_MALE_BODY_STANDARD: string;
export const EXCEPTION_BODY_STANDARD: string;
export const NEUTRAL_BODY_STANDARD: string;
export function extractAssetCharacterBodyStandard(description: string): string | null;
export function removeAssetCharacterBodyStandard(description: string): string;
export function resolveAssetCharacterBodyStandard(description: string): string;
export const ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS: string;
```

推断优先级：已有字段 > 未成年/老人/病弱/残障/特殊身份 > 明确普通成年女性 > 明确成年男性及古今线索 > 中性兜底。明确男性矮壮、魁梧、瘦小、年长时使用原文优先标准，不强制统一男性比例。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- src/domain/assetCharacterBodyStandards.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/domain/assetCharacterBodyStandards.ts src/domain/assetCharacterBodyStandards.test.ts
git commit -m "Add asset character body standard resolver"
```

### Task 2: 强制人物提取输出独立体态字段

**Files:**
- Modify: `src/domain/templates.ts:1815`
- Modify: `src/domain/templates.test.ts:800`

- [ ] **Step 1: 写字段结构失败测试**

人物提取 prompt 必须按顺序包含：

```ts
const appearanceIndex = prompt.indexOf("人物外貌：");
const bodyIndex = prompt.indexOf("体态标准：");
const styleIndex = prompt.indexOf("整体风格：");
expect(appearanceIndex).toBeLessThan(bodyIndex);
expect(bodyIndex).toBeLessThan(styleIndex);
```

并断言体态字段不能写“按统一标准”“身材好”或省略。

- [ ] **Step 2: 写三类标准和例外失败测试**

人物提取 prompt 必须完整包含：

- 普通成年女性的 S 曲线、蜂腰、胯部、长腿和三视图比例一致。
- 古风成年男性的宽肩窄腰、直角肩、修长躯干和流畅肌肉。
- 现代成年男性的宽肩阔背、紧致窄腰、利落体态和自然肌肉。
- 未成年人、老人、病弱、残障、特殊身份及原文明示男性体态的覆盖优先级。

- [ ] **Step 3: 写场景物品隔离失败测试**

```ts
expect(scenePrompt).not.toContain("体态标准：");
expect(propPrompt).not.toContain("古风成年男性");
expect(propPrompt).not.toContain("现代成年男性");
```

- [ ] **Step 4: 运行模板测试确认失败**

Run: `npm test -- src/domain/templates.test.ts`

Expected: FAIL，当前输出结构没有独立体态字段。

- [ ] **Step 5: 注入共享规则并调整输出顺序**

从新模块导入 `ASSET_CHARACTER_BODY_STANDARD_INSTRUCTIONS`，仅人物提取时注入；在 `buildAssetCharacterOutputFormat()` 的 `人物外貌` 后新增：

```text
体态标准：必须根据体态路由写出该角色完整、可直接生图的体态描述；不得写“按统一标准”“身材好”或省略。
```

人物示例同步增加 `体态标准：`，并明确示例体态不得复制给其他角色。

- [ ] **Step 6: 运行测试确认通过**

Run: `npm test -- src/domain/templates.test.ts src/domain/assetCharacterBodyStandards.test.ts`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/domain/templates.ts src/domain/templates.test.ts src/domain/assetCharacterBodyStandards.ts
git commit -m "Require body standards in character extraction"
```

### Task 3: 人物生图保留或补全体态标准

**Files:**
- Modify: `src/components/Workspace.tsx:3072`
- Modify: `src/components/Workspace.test.tsx:3380`

- [ ] **Step 1: 写已有体态字段保留失败测试**

人物描述包含：

```text
人物外貌：成年女性，黑色长发。
体态标准：高挑纤细，右肩略低，正侧背保持同一比例。
整体风格：旧风格。
```

生成 prompt 必须只出现一次该 `体态标准`，原样保留，并位于新画风规则和三视图结构之前。

- [ ] **Step 2: 写漏写补全失败测试**

分别覆盖：

```ts
"成年女性，都市珠宝设计师" -> S 曲线标准
"成年男性，古风将军，束腰战袍" -> 古风男性标准
"成年男性，现代都市设计师，黑色西装" -> 现代男性标准
"儿童，十岁男孩" -> 例外标准
"神秘来客，身份不明" -> 中性兜底
```

- [ ] **Step 3: 写场景物品隔离失败测试**

场景和物品生图 prompt 不得出现 `体态标准：`、女性 S 曲线或男性统一体态词。

- [ ] **Step 4: 运行 Workspace 测试确认失败**

Run: `npm test -- src/components/Workspace.test.tsx`

Expected: FAIL，当前生图只附加长画风规则，没有独立体态补全。

- [ ] **Step 5: 集成共享解析器**

人物生图时：

```ts
const bodyStandard = resolveAssetCharacterBodyStandard(cleanedDescription);
const sourceWithoutBodyStandard = removeAssetCharacterBodyStandard(cleanedDescription);
```

提示词顺序调整为：资产元数据 > `人物体态（高优先级）` > 体态标准 > 当前画风规则 > 人物提取内容 > 三视图结构。已有字段提取后只输出一次；旧风格清理继续生效。

- [ ] **Step 6: 增强三视图一致性约束**

加入：

```text
下方正面、侧面、背面必须严格执行同一体态标准和人体比例，不得出现正面、侧面、背面肩腰胯和腿部比例变化。
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npm test -- src/components/Workspace.test.tsx src/domain/assetCharacterBodyStandards.test.ts`

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add src/components/Workspace.tsx src/components/Workspace.test.tsx
git commit -m "Enforce body standards in character image prompts"
```

### Task 4: 最终验证

**Files:**
- Test: `src/domain/assetCharacterBodyStandards.test.ts`
- Test: `src/domain/templates.test.ts`
- Test: `src/components/Workspace.test.tsx`

- [ ] **Step 1: 运行定向测试**

Run: `npm test -- src/domain/assetCharacterBodyStandards.test.ts src/domain/templates.test.ts src/components/Workspace.test.tsx`

Expected: PASS。

- [ ] **Step 2: 运行全量测试**

Run: `npm test`

Expected: 全部测试通过。

- [ ] **Step 3: 运行生产构建**

Run: `npm run build`

Expected: TypeScript 和 Vite 构建成功。

- [ ] **Step 4: 检查提交范围**

Run: `git diff --check && git status --short`

Expected: 无空白错误；现有安装包和其他无关未跟踪文件不加入提交。
