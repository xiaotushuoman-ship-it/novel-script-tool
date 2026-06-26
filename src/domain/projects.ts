import type { TemplateId } from "./templates";

export type StepVersion = {
  id: string;
  content: string;
  createdAt: string;
};

export type StepState = {
  inputs: Record<string, string>;
  draft: string;
  versions: StepVersion[];
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  currentStep: TemplateId;
  projectNotes: {
    world: string;
    characters: string;
    continuity: string;
  };
  steps: Record<TemplateId, StepState>;
};

const STORAGE_KEY = "novel-script-tool.projects";
const STEP_IDS: TemplateId[] = [
  "outline-expansion",
  "chapter-split",
  "prose-generation",
  "novel-to-script",
  "asset-extraction",
  "asset-library",
  "storyboard-15s",
  "gpt-image2-storyboard",
  "xiaotu-skill",
  "seedance-video",
  "custom-image",
];

function createEmptyStep(): StepState {
  return { inputs: {}, draft: "", versions: [] };
}

function normalizeProject(project: Project): Project {
  const steps = { ...project.steps };
  for (const stepId of STEP_IDS) {
    steps[stepId] = steps[stepId] ?? createEmptyStep();
  }
  return { ...project, steps };
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createProject(name: string): Project {
  const timestamp = now();
  const steps = STEP_IDS.reduce(
    (accumulator, stepId) => {
      accumulator[stepId] = createEmptyStep();
      return accumulator;
    },
    {} as Record<TemplateId, StepState>,
  );

  return {
    id: makeId("project"),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    currentStep: "outline-expansion",
    projectNotes: { world: "", characters: "", continuity: "" },
    steps,
  };
}

export function loadProjects(): Project[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as Project[]).map(normalizeProject);
  } catch {
    return [];
  }
}

export function saveProject(project: Project): Project {
  const updated = { ...project, updatedAt: now() };
  const projects = loadProjects().filter((item) => item.id !== updated.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([updated, ...projects]));
  return updated;
}

export function addVersion(project: Project, stepId: TemplateId, content: string): Project {
  const version: StepVersion = { id: makeId("version"), content, createdAt: now() };
  return {
    ...project,
    updatedAt: now(),
    steps: {
      ...project.steps,
      [stepId]: {
        ...project.steps[stepId],
        draft: content,
        versions: [...project.steps[stepId].versions, version],
      },
    },
  };
}

export function deleteVersion(project: Project, stepId: TemplateId, versionId: string): Project {
  return {
    ...project,
    updatedAt: now(),
    steps: {
      ...project.steps,
      [stepId]: {
        ...project.steps[stepId],
        versions: project.steps[stepId].versions.filter((version) => version.id !== versionId),
      },
    },
  };
}

export function restoreVersion(project: Project, stepId: TemplateId, versionId: string): Project {
  const version = project.steps[stepId].versions.find((item) => item.id === versionId);
  if (!version) return project;

  return {
    ...project,
    updatedAt: now(),
    steps: {
      ...project.steps,
      [stepId]: {
        ...project.steps[stepId],
        draft: version.content,
      },
    },
  };
}
