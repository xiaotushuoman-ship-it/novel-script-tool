import { describe, expect, it } from "vitest";
import { createProject } from "./projects";
import { transferToNextStep } from "./workflow";

describe("workflow transfer", () => {
  it("moves one-click novel output directly into novel-to-script source scene", () => {
    const project = createProject("一键小说衔接测试");
    project.steps["outline-expansion"].draft = "第1章正文内容";

    const next = transferToNextStep(project, "outline-expansion");

    expect(next.currentStep).toBe("novel-to-script");
    expect(next.steps["novel-to-script"].inputs.sourceScene).toBe("第1章正文内容");
  });

  it("moves prose output into novel-to-script source scene", () => {
    const project = createProject("衔接测试");
    project.steps["prose-generation"].draft = "第1章正文内容";

    const next = transferToNextStep(project, "prose-generation");

    expect(next.currentStep).toBe("novel-to-script");
    expect(next.steps["novel-to-script"].inputs.sourceScene).toBe("第1章正文内容");
  });

  it("moves extracted script assets into the 15-second storyboard source", () => {
    const project = createProject("分镜衔接测试");
    project.steps["asset-extraction"].draft = "人物：女主，白衬衫，夜市摊前。";

    const next = transferToNextStep(project, "asset-extraction");

    expect(next.currentStep).toBe("storyboard-15s");
    expect(next.steps["storyboard-15s"].inputs.scriptText).toBe("人物：女主，白衬衫，夜市摊前。");
  });
});
