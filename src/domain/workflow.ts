import type { Project } from "./projects";
import type { TemplateId } from "./templates";

const NEXT_STEP: Partial<Record<TemplateId, TemplateId>> = {
  "outline-expansion": "novel-to-script",
  "chapter-split": "prose-generation",
  "prose-generation": "novel-to-script",
  "novel-to-script": "asset-extraction",
  "asset-extraction": "storyboard-15s",
  "storyboard-15s": "gpt-image2-storyboard",
};

export function transferToNextStep(project: Project, fromStep: TemplateId): Project {
  const nextStep = NEXT_STEP[fromStep];
  if (!nextStep) return project;

  const draft = project.steps[fromStep].draft;
  const nextInputs = { ...project.steps[nextStep].inputs };

  if (fromStep === "outline-expansion") nextInputs.sourceScene = draft;
  if (fromStep === "chapter-split") nextInputs.chapterOutline = draft;
  if (fromStep === "prose-generation") nextInputs.sourceScene = draft;
  if (fromStep === "novel-to-script") nextInputs.sourceText = draft;
  if (fromStep === "asset-extraction") nextInputs.scriptText = draft;
  if (fromStep === "storyboard-15s") nextInputs.sourceText = draft;

  return {
    ...project,
    currentStep: nextStep,
    steps: {
      ...project.steps,
      [nextStep]: {
        ...project.steps[nextStep],
        inputs: nextInputs,
      },
    },
  };
}
