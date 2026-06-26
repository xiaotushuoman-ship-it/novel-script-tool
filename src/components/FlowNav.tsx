import { FilePlus2, Save, Settings } from "lucide-react";
import type { Project } from "../domain/projects";
import type { TemplateId } from "../domain/templates";
import { TEMPLATES } from "../domain/templates";

type Props = {
  activeStep: TemplateId;
  projects: Project[];
  activeProjectId: string;
  onSelectStep: (step: TemplateId) => void;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onOpenSettings: () => void;
};

const PRIMARY_STEP_IDS: TemplateId[] = [
  "outline-expansion",
  "novel-to-script",
  "asset-extraction",
  "asset-library",
  "storyboard-15s",
  "gpt-image2-storyboard",
  "xiaotu-skill",
  "seedance-video",
  "custom-image",
];

export function FlowNav({
  activeStep,
  projects,
  activeProjectId,
  onSelectStep,
  onSelectProject,
  onCreateProject,
  onOpenSettings,
}: Props) {
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];

  function getStepStatus(stepId: TemplateId) {
    const step = activeProject?.steps[stepId];
    if (!step) return "空白";
    if (step.versions.length > 0) return "已保存";
    if (step.draft.trim() || Object.values(step.inputs).some((value) => String(value).trim())) return "草稿";
    return "空白";
  }

  return (
    <aside className="left-panel">
      <div className="panel-title">项目</div>
      <select
        aria-label="选择项目"
        className="project-select"
        value={activeProjectId}
        onChange={(event) => onSelectProject(event.target.value)}
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <div className="compact-actions">
        <button onClick={onCreateProject} title="新建项目">
          <FilePlus2 size={16} />
          新建
        </button>
        <button onClick={onOpenSettings} title="API 设置">
          <Settings size={16} />
          设置
        </button>
      </div>

      <div className="panel-title flow-title">主流程</div>
      {TEMPLATES.filter((template) => PRIMARY_STEP_IDS.includes(template.id)).map((template, index) => (
        <button
          className={template.id === activeStep ? "step-button active" : "step-button"}
          key={template.id}
          onClick={() => onSelectStep(template.id)}
        >
          <span className="step-index">{index + 1}</span>
          <span>
            <strong>{template.name}</strong>
            <small>{template.description}</small>
            <em className={`step-status step-status-${getStepStatus(template.id)}`}>
              {getStepStatus(template.id)}
            </em>
          </span>
        </button>
      ))}

      <div className="project-note">
        <Save size={16} />
        <span>所有内容自动保存到浏览器本地。</span>
      </div>
    </aside>
  );
}
