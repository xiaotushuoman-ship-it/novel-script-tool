import { beforeEach, describe, expect, it } from "vitest";
import { addVersion, createProject, deleteVersion, loadProjects, restoreVersion, saveProject } from "./projects";

beforeEach(() => {
  localStorage.clear();
});

describe("projects", () => {
  it("creates and saves a project locally", () => {
    const project = createProject("第一本短剧小说");
    saveProject(project);

    expect(loadProjects()).toHaveLength(1);
    expect(loadProjects()[0].name).toBe("第一本短剧小说");
  });

  it("adds step versions without overwriting existing output", () => {
    const project = createProject("版本测试");
    const updated = addVersion(project, "prose-generation", "第一版正文");
    const updatedAgain = addVersion(updated, "prose-generation", "第二版正文");

    expect(updatedAgain.steps["prose-generation"].versions.map((item) => item.content)).toEqual([
      "第一版正文",
      "第二版正文",
    ]);
  });

  it("deletes one saved version without changing the current draft", () => {
    const project = createProject("版本删除测试");
    const first = addVersion(project, "prose-generation", "第一版正文");
    const second = addVersion(first, "prose-generation", "第二版正文");
    const versionToDelete = second.steps["prose-generation"].versions[0];

    const updated = deleteVersion(second, "prose-generation", versionToDelete.id);

    expect(updated.steps["prose-generation"].draft).toBe("第二版正文");
    expect(updated.steps["prose-generation"].versions.map((item) => item.content)).toEqual(["第二版正文"]);
  });

  it("restores a saved version into the current draft without deleting history", () => {
    const project = createProject("版本恢复测试");
    const first = addVersion(project, "prose-generation", "第一版正文");
    const second = addVersion(first, "prose-generation", "第二版正文");
    const versionToRestore = second.steps["prose-generation"].versions[0];

    const updated = restoreVersion(second, "prose-generation", versionToRestore.id);

    expect(updated.steps["prose-generation"].draft).toBe("第一版正文");
    expect(updated.steps["prose-generation"].versions.map((item) => item.content)).toEqual([
      "第一版正文",
      "第二版正文",
    ]);
  });
});
