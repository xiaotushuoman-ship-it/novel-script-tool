import type { Project } from "./projects";
import { TEMPLATES } from "./templates";

export function exportProjectMarkdown(project: Project): string {
  const lines: string[] = [
    `# ${project.name}`,
    "",
    `- 创建时间：${project.createdAt}`,
    `- 更新时间：${project.updatedAt}`,
  ];

  for (const template of TEMPLATES) {
    const step = project.steps[template.id];
    if (!step) continue;
    const versions = step.versions ?? [];
    const currentDraft = (step.draft ?? "").trim();
    if (!currentDraft && versions.length === 0) continue;

    lines.push("", `## ${template.name}`, "");
    if (currentDraft) {
      lines.push("### 当前结果", "", currentDraft, "");
    }

    if (versions.length === 0) {
      continue;
    }
    lines.push("### 历史版本", "");
    versions.forEach((version, index) => {
      lines.push(`#### 版本 ${index + 1} - ${version.createdAt}`, "", version.content, "");
    });
  }

  return lines.join("\n");
}
