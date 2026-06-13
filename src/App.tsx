import { useEffect, useMemo, useState } from "react";
import { FlowNav } from "./components/FlowNav";
import { SettingsDialog } from "./components/SettingsDialog";
import { SidePanel } from "./components/SidePanel";
import { Workspace } from "./components/Workspace";
import type { AiSettings } from "./domain/aiClient";
import { loadAiSettings, saveAiSettings } from "./domain/aiSettings";
import {
  addVersion,
  createProject,
  deleteVersion,
  loadProjects,
  restoreVersion,
  saveProject,
  type Project,
} from "./domain/projects";
import type { TemplateId } from "./domain/templates";

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    const stored = loadProjects();
    if (stored.length > 0) return stored;
    const first = saveProject(createProject("我的小说剧本项目"));
    return [first];
  });
  const [activeProjectId, setActiveProjectId] = useState(() => projects[0].id);
  const [aiSettings, setAiSettings] = useState(loadAiSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeProject = useMemo(() => {
    return projects.find((project) => project.id === activeProjectId) ?? projects[0];
  }, [activeProjectId, projects]);

  useEffect(() => {
    saveAiSettings(aiSettings);
  }, [aiSettings]);

  function updateProject(project: Project) {
    const saved = saveProject(project);
    const nextProjects = loadProjects();
    setProjects(nextProjects);
    setActiveProjectId(saved.id);
  }

  function updateStepDraft(projectId: string, stepId: TemplateId, draft: string) {
    setProjects((currentProjects) => {
      const currentProject = currentProjects.find((project) => project.id === projectId);
      if (!currentProject) return currentProjects;
      const updatedProject = saveProject({
        ...currentProject,
        steps: {
          ...currentProject.steps,
          [stepId]: {
            ...currentProject.steps[stepId],
            draft,
          },
        },
      });
      return currentProjects.map((project) => (project.id === updatedProject.id ? updatedProject : project));
    });
  }

  function createNewProject() {
    const name = `小说剧本项目 ${projects.length + 1}`;
    const project = saveProject(createProject(name));
    setProjects(loadProjects());
    setActiveProjectId(project.id);
  }

  function selectStep(step: TemplateId) {
    updateProject({ ...activeProject, currentStep: step });
  }

  function saveCurrentVersion(content: string) {
    if (!content.trim()) return;
    updateProject(addVersion(activeProject, activeProject.currentStep, content));
  }

  function deleteSavedVersion(stepId: TemplateId, versionId: string) {
    updateProject(deleteVersion(activeProject, stepId, versionId));
  }

  function restoreSavedVersion(stepId: TemplateId, versionId: string) {
    updateProject(restoreVersion(activeProject, stepId, versionId));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>小兔助手</h1>
        </div>
      </header>
      <div className="layout">
        <FlowNav
          activeProjectId={activeProject.id}
          activeStep={activeProject.currentStep}
          projects={projects}
          onCreateProject={createNewProject}
          onOpenSettings={() => setSettingsOpen(true)}
          onSelectProject={setActiveProjectId}
          onSelectStep={selectStep}
        />
        <Workspace
          aiSettings={aiSettings}
          project={activeProject}
          onAiSettingsChange={setAiSettings}
          onProjectChange={updateProject}
          onStepDraftChange={updateStepDraft}
          onSaveVersion={saveCurrentVersion}
        />
        <SidePanel
          project={activeProject}
          onDeleteVersion={deleteSavedVersion}
          onRestoreVersion={restoreSavedVersion}
        />
      </div>
      <SettingsDialog
        open={settingsOpen}
        settings={aiSettings}
        onChange={setAiSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}
