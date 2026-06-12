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
    lines.push("", `## ${template.name}`, "");
    if (step.versions.length === 0) {
      lines.push("暂无保存版本。");
      continue;
    }
    step.versions.forEach((version, index) => {
      lines.push(`### 版本 ${index + 1} - ${version.createdAt}`, "", version.content, "");
    });
  }

  return lines.join("\n");
}
