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
});
