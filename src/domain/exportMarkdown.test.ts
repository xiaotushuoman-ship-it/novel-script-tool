import { describe, expect, it } from "vitest";
import { addVersion, createProject } from "./projects";
import { exportProjectMarkdown } from "./exportMarkdown";

describe("exportProjectMarkdown", () => {
  it("exports saved versions without project notes", () => {
    const project = addVersion(createProject("导出测试"), "outline-expansion", "扩写正文");
    project.projectNotes.world = "市井小镇";

    const markdown = exportProjectMarkdown(project);

    expect(markdown).toContain("# 导出测试");
    expect(markdown).toContain("扩写正文");
    expect(markdown).not.toContain("项目资料");
    expect(markdown).not.toContain("市井小镇");
  });

  it("exports current drafts even when no version has been saved", () => {
    const project = createProject("当前结果导出测试");
    project.steps["asset-extraction"].draft = "【人物】林晚：白衬衫，夜市摊主。";

    const markdown = exportProjectMarkdown(project);

    expect(markdown).toContain("## 剧本资产提取");
    expect(markdown).toContain("### 当前结果");
    expect(markdown).toContain("【人物】林晚：白衬衫，夜市摊主。");
    expect(markdown).not.toContain("暂无保存版本。");
  });

  it("skips missing steps from older saved projects", () => {
    const project = createProject("old-project-export");
    delete (project.steps as Partial<typeof project.steps>)["script-polish"];

    expect(() => exportProjectMarkdown(project)).not.toThrow();
  });
});
