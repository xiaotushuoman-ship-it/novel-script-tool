# 第 3 项 3D 角色风格分流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为第 3 项人物资产新增两种可控 3D 画风，并让仿真、甜酷乙游、国漫、皮克斯和低多边形使用互不污染的提示词规则。

**Architecture:** 继续由 `src/domain/templates.ts` 提供画风选项和人物提取提示词，但将当前泛化 3D 分支改成显式风格配置。`Workspace` 生图阶段增加同样的当前画风规则，确保用户切换画风后仍保留人物身份、外貌、服装和三视图结构，同时过滤旧画风渲染词。

**Tech Stack:** TypeScript、React、Vitest、Testing Library、Vite

---

### Task 1: 新增明确的 3D 画风选项

**Files:**
- Modify: `src/domain/templates.ts:126`
- Test: `src/domain/templates.test.ts:360`

- [ ] **Step 1: 写失败测试**

在画风选项测试中增加：

```ts
expect(fields.visualStyle.options).toContain("3D仿真精致角色");
expect(fields.visualStyle.options).toContain("现代甜酷3D乙游");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/domain/templates.test.ts`

Expected: FAIL，提示两个新选项不存在。

- [ ] **Step 3: 添加最小实现**

在 `STORYBOARD_STYLE_OPTIONS` 中紧邻 `3D国漫风格` 添加：

```ts
"3D仿真精致角色",
"现代甜酷3D乙游",
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/domain/templates.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/domain/templates.ts src/domain/templates.test.ts
git commit -m "Add distinct 3D character style options"
```

### Task 2: 建立五类互斥的 3D 人物提示词配置

**Files:**
- Modify: `src/domain/templates.ts:1777`
- Test: `src/domain/templates.test.ts:800`

- [ ] **Step 1: 写 3D 仿真风格失败测试**

构建 `visualStyle: "3D仿真精致角色"` 的人物提示词并断言：

```ts
expect(rules).toContain("细腻超清皮肤纹理");
expect(rules).toContain("瓷白或冷白肤色");
expect(rules).toContain("清透裸妆");
expect(rules).toContain("8K CG");
expect(rules).toContain("原文没有规定时");
expect(rules).not.toContain("皮克斯式动画比例");
expect(rules).not.toContain("低多边形几何切面");
```

- [ ] **Step 2: 写现代甜酷乙游失败测试**

```ts
expect(rules).toContain("现代甜酷3D乙游");
expect(rules).toContain("皮革亮面与哑光拼接");
expect(rules).toContain("蕾丝与金属饰品");
expect(rules).toContain("高级3D乙游主角标准");
expect(rules).toContain("暗黑贵族或哥特造型只能在剧情支持时使用");
expect(rules).not.toContain("古风国漫服饰");
```

- [ ] **Step 3: 写皮克斯与低多边形隔离失败测试**

```ts
expect(pixarRules).toContain("动画化比例");
expect(pixarRules).not.toContain("毛孔级仿真皮肤");
expect(lowPolyRules).toContain("低多边形几何切面");
expect(lowPolyRules).not.toContain("次表面散射");
expect(lowPolyRules).not.toContain("摄影级发丝");
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npm test -- src/domain/templates.test.ts`

Expected: FAIL，当前通用 3D 分支不包含独立词汇。

- [ ] **Step 5: 实现显式风格分流**

保留 `adaptiveCharacterDesign`，在 `buildAssetCharacterStyleRule()` 中按完整名称依次处理：

```ts
if (visualStyle === "3D仿真精致角色") return buildSimulationRule(adaptiveCharacterDesign);
if (visualStyle === "现代甜酷3D乙游") return buildOtomeRule(adaptiveCharacterDesign);
if (visualStyle === "3D国漫风格") return buildGuomanRule(adaptiveCharacterDesign);
if (visualStyle === "皮克斯式3D动画") return buildPixarRule(adaptiveCharacterDesign);
if (visualStyle === "低多边形游戏风") return buildLowPolyRule(adaptiveCharacterDesign);
```

各返回文本必须完整写出设计规格中的皮肤、妆造、服装材质、男女角色差异和冲突禁词；其他未知 3D 风格仍落入保守通用 3D 分支。

- [ ] **Step 6: 加强共用原文优先与防撞脸规则**

在 `adaptiveCharacterDesign` 中明确：

```ts
原文明确的人物年龄、脸型、五官、发型、发色、妆容、服装、饰品和身份设定优先，不得被模板覆盖；只有原文缺失时，才按人物身份和剧情分配不同妆容、发型、发色、饰品、动作和展示角度。不同角色的脸型、骨相、眉眼、瞳色、鼻唇、发型发色、妆容、服装配色和饰品组合不得重复。
```

继续保留成年女性 S 曲线和华丽服装规则，以及未成年人、老人、儿童、病弱者的排除规则。

- [ ] **Step 7: 运行模板测试确认通过**

Run: `npm test -- src/domain/templates.test.ts`

Expected: PASS，五类 3D 分支均命中自身规则且无串词。

- [ ] **Step 8: 提交**

```bash
git add src/domain/templates.ts src/domain/templates.test.ts
git commit -m "Route asset characters through distinct 3D profiles"
```

### Task 3: 保证人物生图继续使用当前选择的风格配置

**Files:**
- Modify: `src/components/Workspace.tsx:2969`
- Test: `src/components/Workspace.test.tsx:4240`

- [ ] **Step 1: 写仿真人物生图失败测试**

创建 `visualStyle: "3D仿真精致角色"` 的人物资产，点击生成后断言传给 `callImageGeneration` 的提示词：

```ts
expect(prompt).toContain("指定画风：3D仿真精致角色");
expect(prompt).toContain("细腻超清皮肤纹理");
expect(prompt).toContain("角色长相必须完全区分");
expect(prompt).toContain("原文明确设定优先");
expect(prompt).toContain("上方三分之一为正面脸部近景头像");
expect(prompt).not.toContain("低多边形几何切面");
```

- [ ] **Step 2: 写切换为甜酷乙游的保真失败测试**

资产草稿中包含旧 `3D国漫风格` 渲染词，但当前选择为 `现代甜酷3D乙游`：

```ts
expect(prompt).toContain("指定画风：现代甜酷3D乙游");
expect(prompt).toContain("皮革亮面与哑光拼接");
expect(prompt).toContain("人物外貌：二十岁出头，瓜子脸");
expect(prompt).not.toContain("画风锚点：3D国漫风格");
expect(prompt).not.toContain("PBR国风材质");
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- src/components/Workspace.test.tsx`

Expected: FAIL，当前生图提示词只有通用画风锁定，没有独立 3D 配置。

- [ ] **Step 4: 提取共享的当前人物画风规则**

从模板域导出纯函数：

```ts
export function buildAssetCharacterStyleRule(visualStyle: string): string
```

在 `Workspace.tsx` 的人物生图提示词中加入该函数结果；保留现有从资产描述中过滤 `整体风格：` 行的逻辑，使当前选项始终覆盖旧渲染词，但不删除人物外貌、身份、服装和饰品描述。

- [ ] **Step 5: 运行 Workspace 测试确认通过**

Run: `npm test -- src/components/Workspace.test.tsx`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/domain/templates.ts src/components/Workspace.tsx src/components/Workspace.test.tsx
git commit -m "Preserve selected 3D style in asset image prompts"
```

### Task 4: 验证人物范围隔离与生产构建

**Files:**
- Test: `src/domain/templates.test.ts`
- Test: `src/components/Workspace.test.tsx`

- [ ] **Step 1: 增加场景和物品隔离断言**

```ts
expect(scenePrompt).not.toContain("饱满S曲线");
expect(scenePrompt).not.toContain("清透裸妆");
expect(propPrompt).not.toContain("高级3D乙游主角标准");
expect(propPrompt).not.toContain("皮革亮面与哑光拼接");
```

- [ ] **Step 2: 运行针对性测试**

Run: `npm test -- src/domain/templates.test.ts src/components/Workspace.test.tsx`

Expected: PASS。

- [ ] **Step 3: 运行完整测试**

Run: `npm test`

Expected: 全部测试通过，无失败和未处理错误。

- [ ] **Step 4: 运行生产构建**

Run: `npm run build`

Expected: TypeScript 编译和 Vite 构建成功。

- [ ] **Step 5: 检查改动范围**

Run: `git diff --check && git status --short`

Expected: 无空白错误；只包含本功能相关已跟踪文件，现有无关未跟踪安装文件不加入提交。

- [ ] **Step 6: 最终提交**

```bash
git add src/domain/templates.ts src/domain/templates.test.ts src/components/Workspace.tsx src/components/Workspace.test.tsx
git commit -m "Complete refined 3D asset character profiles"
```
