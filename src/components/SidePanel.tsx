import { Download, FileText, Trash2 } from "lucide-react";
import type { Project } from "../domain/projects";
import { exportProjectMarkdown } from "../domain/exportMarkdown";
import { getTemplate, type TemplateId } from "../domain/templates";

type Props = {
  allowOwnerExports?: boolean;
  project: Project;
  onDeleteVersion: (stepId: TemplateId, versionId: string) => void;
  onRestoreVersion: (stepId: TemplateId, versionId: string) => void;
};

export function SidePanel({ allowOwnerExports = false, project, onDeleteVersion, onRestoreVersion }: Props) {
  const step = project.steps[project.currentStep];
  const markdown = exportProjectMarkdown(project);

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.name || "novel-script-project"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
      <aside className="right-panel">
      <div className="panel-title">辅助面板</div>
      <h3>历史版本</h3>
      <div className="history-list">
        {step.versions.length === 0 ? (
          <p className="muted">当前步骤还没有保存版本。</p>
        ) : (
          step.versions.map((version, index) => (
            <details className="version-card" key={version.id}>
              <summary>
                {getTemplate(project.currentStep).name} 版本 {index + 1}
              </summary>
              <small>{new Date(version.createdAt).toLocaleString()}</small>
              <pre>{version.content}</pre>
              <div className="version-actions">
                <button
                  className="secondary-button"
                  onClick={() => onRestoreVersion(project.currentStep, version.id)}
                >
                  恢复到草稿
                </button>
                <button
                  className="danger-button"
                  onClick={() => onDeleteVersion(project.currentStep, version.id)}
                >
                  <Trash2 size={16} />
                  删除版本 {index + 1}
                </button>
              </div>
            </details>
          ))
        )}
      </div>

      {allowOwnerExports ? (
        <div className="side-actions">
          <button onClick={() => navigator.clipboard.writeText(markdown)}>
            <FileText size={16} />
            复制项目 Markdown
          </button>
          <button className="secondary-button" onClick={downloadMarkdown}>
            <Download size={16} />
            下载 Markdown
          </button>
        </div>
      ) : null}
    </aside>
  );
}
