import { Bot, Clipboard, Download, FileImage, FileUp, Play, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { callAi, callAiStream, callImageGeneration, type AiSettings } from "../domain/aiClient";
import {
  addAssetLibraryItem,
  deleteAssetLibraryItem,
  loadAssetLibrary,
  updateAssetLibraryItem,
  type AssetLibraryItem,
  type AssetLibraryType,
} from "../domain/assetLibrary";
import type { Project } from "../domain/projects";
import {
  buildPrompt,
  getTemplate,
  LOCAL_TREND_TOPIC_RECOMMENDATIONS,
  IMAGE_MODEL_OPTIONS,
  IMAGE_RESOLUTION_OPTIONS,
  type TopicRecommendation,
  type TemplateField,
  type TemplateId,
} from "../domain/templates";
import { sendAssetsToZzdh, sendStoryboardToZzdh } from "../domain/zzdhClient";

type GenerationProgress = {
  label: string;
  percent: number;
};

type StepGenerationState = {
  isCalling: boolean;
  status: string;
  progress: GenerationProgress | null;
};

type ImageResult = {
  id: string;
  src: string;
  assetName: string;
  assetType: AssetLibraryType;
  prompt: string;
  model: string;
  ratio: string;
  resolution: string;
};

type PreviewImage = {
  src: string;
  alt: string;
  filename: string;
  image?: ImageResult;
};

type ExtractedAsset = {
  id: string;
  name: string;
  type: string;
  description: string;
  lineIndex: number;
};

type ChapterOption = {
  number: string;
  title: string;
  outline: string;
};

type TopicRecommendationState = {
  isLoading: boolean;
  source: "local" | "ai";
  items: TopicRecommendation[];
  message: string;
};

type Props = {
  project: Project;
  aiSettings: AiSettings;
  onAiSettingsChange: (settings: AiSettings) => void;
  onProjectChange: (project: Project) => void;
  onStepDraftChange?: (projectId: string, stepId: TemplateId, draft: string) => void;
  onSaveVersion: (content: string) => void;
};

const STEP_NAME_BY_ID: Record<TemplateId, string> = {
  "outline-expansion": "一键小说正文生成",
  "chapter-split": "章节拆分",
  "prose-generation": "正文生成",
  "novel-to-script": "小说改剧本",
  "asset-extraction": "剧本资产提取",
  "asset-library": "资产库",
  "storyboard-15s": "15S 分镜脚本",
  "gpt-image2-storyboard": "GPT-image2 四宫格故事板",
};

const NO_PREVIEWABLE_IMAGE_MESSAGE = "模型已响应，但没有返回可预览图片。请换生图模型或检查该模型是否支持图片输出。";
const DEFAULT_CUSTOM_IMAGE_PREFIX = [
  "布局标准：横向专业角色设定表",
  "左侧区域：正面面部高清特写（重点展示妆容细节）",
  "右侧区域：全身三视图（包含正面/侧面/背面）",
  "不要出现任何字幕",
].join("\n");

export function Workspace({
  project,
  aiSettings,
  onAiSettingsChange,
  onProjectChange,
  onStepDraftChange,
  onSaveVersion,
}: Props) {
  const isAssetLibraryStep = project.currentStep === "asset-library";
  const template = getTemplate(project.currentStep);
  const step = project.steps[project.currentStep];
  const [status, setStatus] = useState("");
  const [generationByStep, setGenerationByStep] = useState<Partial<Record<TemplateId, StepGenerationState>>>({});
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSendingToZzdh, setIsSendingToZzdh] = useState(false);
  const [isSendingAssetsToZzdh, setIsSendingAssetsToZzdh] = useState(false);
  const [upscalingImageId, setUpscalingImageId] = useState<string | null>(null);
  const [generatingAssets, setGeneratingAssets] = useState<Record<string, boolean>>({});
  const [isGeneratingCustomImages, setIsGeneratingCustomImages] = useState(false);
  const [assetImageResults, setAssetImageResults] = useState<ImageResult[]>([]);
  const [storyboardImageResults, setStoryboardImageResults] = useState<ImageResult[]>([]);
  const [storyboardImageProgress, setStoryboardImageProgress] = useState<GenerationProgress | null>(null);
  const [storyboardImageStatus, setStoryboardImageStatus] = useState("");
  const [upscaleProgress, setUpscaleProgress] = useState<GenerationProgress | null>(null);
  const [upscaleStatus, setUpscaleStatus] = useState("");
  const [customImagePrefix, setCustomImagePrefix] = useState(DEFAULT_CUSTOM_IMAGE_PREFIX);
  const [customImagePrompt, setCustomImagePrompt] = useState("");
  const [customImageCount, setCustomImageCount] = useState("1");
  const [assetLibraryItems, setAssetLibraryItems] = useState<AssetLibraryItem[]>(() => loadAssetLibrary());
  const [assetLibraryImportType, setAssetLibraryImportType] = useState<AssetLibraryType>("人物");
  const [assetLibraryImportName, setAssetLibraryImportName] = useState("");
  const [assetLibrarySaveDirectory, setAssetLibrarySaveDirectory] = useState("");
  const [assetLibrarySearch, setAssetLibrarySearch] = useState("");
  const [assetLibraryPageByType, setAssetLibraryPageByType] = useState<Record<AssetLibraryType, number>>({
    人物: 0,
    场景: 0,
    物品: 0,
  });
  const [editingAssetNames, setEditingAssetNames] = useState<Record<string, string>>({});
  const [editedAssetDescriptions, setEditedAssetDescriptions] = useState<Record<string, string>>({});
  const [topicRecommendations, setTopicRecommendations] = useState<TopicRecommendationState>({
    isLoading: false,
    source: "local",
    items: LOCAL_TREND_TOPIC_RECOMMENDATIONS,
    message: "",
  });
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const imageProgressTimerRef = useRef<number | null>(null);
  const storyboardImageProgressTimerRef = useRef<number | null>(null);
  const textProgressTimerRefs = useRef<Partial<Record<TemplateId, number>>>({});
  const imageResultIdRef = useRef(0);
  const currentGeneration = generationByStep[project.currentStep] ?? {
    isCalling: false,
    status: "",
    progress: null,
  };
  const visibleProgress = project.currentStep === "asset-extraction" && progress ? progress : currentGeneration.progress;
  const visibleStatus = currentGeneration.status || status;
  const backgroundTasks = Object.entries(generationByStep)
    .filter(([, task]) => task?.progress || task?.status)
    .map(([stepId, task]) => ({
      stepId: stepId as TemplateId,
      task: task as StepGenerationState,
    }));

  useEffect(() => {
    if (isAssetLibraryStep) {
      setAssetLibraryItems(loadAssetLibrary());
    }
    return () => {
      stopImageProgressTimer();
      stopStoryboardImageProgressTimer();
      stopAllTextProgressTimers();
    };
  }, [isAssetLibraryStep]);

  useEffect(() => {
    if (!previewImage) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewImage(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewImage]);

  const prompt = useMemo(() => {
    try {
      return buildPrompt(template, step.inputs);
    } catch (error) {
      return error instanceof Error ? error.message : "提示词生成失败";
    }
  }, [template, step.inputs]);

  const extractedAssets = useMemo(() => {
    if (project.currentStep !== "asset-extraction") return [];
    return extractAssetsFromDraft(step.draft, step.inputs);
  }, [project.currentStep, step.draft, step.inputs]);
  const chapterOptions = useMemo(() => {
    if (project.currentStep !== "prose-generation") return [];
    return extractChapterOptions(project.steps["chapter-split"].draft);
  }, [project.currentStep, project.steps]);
  const outlineRevisionChapterOptions = useMemo(() => {
    if (project.currentStep !== "outline-expansion") return [];
    const extractedChapters = extractChapterOptions(step.draft);
    const totalChapters = Number.parseInt(step.inputs.totalChapters || "20", 10) || 20;
    const highestChapterNumber =
      extractedChapters.reduce((max, chapter) => Math.max(max, Number.parseInt(chapter.number, 10) || 0), 0) || 0;
    const chapterCount = Math.max(totalChapters, highestChapterNumber, 1);
    const chapterMap = new Map(extractedChapters.map((chapter) => [chapter.number, chapter]));

    return Array.from({ length: chapterCount }, (_, index) => {
      const chapterNumber = String(index + 1);
      const extracted = chapterMap.get(chapterNumber);
      return extracted ?? { number: chapterNumber, title: `第${chapterNumber}章`, outline: `第${chapterNumber}章` };
    });
  }, [project.currentStep, step.draft, step.inputs.totalChapters]);
  const assetLibraryGroups = useMemo(
    () => ({
      人物: assetLibraryItems.filter((item) => item.type === "人物"),
      场景: assetLibraryItems.filter((item) => item.type === "场景"),
      物品: assetLibraryItems.filter((item) => item.type === "物品"),
    }),
    [assetLibraryItems],
  );
  const filteredAssetLibraryGroups = useMemo(
    () => ({
      人物: assetLibraryGroups.人物.filter((item) => item.name.includes(assetLibrarySearch.trim())),
      场景: assetLibraryGroups.场景.filter((item) => item.name.includes(assetLibrarySearch.trim())),
      物品: assetLibraryGroups.物品.filter((item) => item.name.includes(assetLibrarySearch.trim())),
    }),
    [assetLibraryGroups, assetLibrarySearch],
  );

  useEffect(() => {
    setAssetLibraryPageByType({
      人物: 0,
      场景: 0,
      物品: 0,
    });
  }, [assetLibrarySearch]);

  function updateInput(key: string, value: string) {
    onProjectChange({
      ...project,
      steps: {
        ...project.steps,
        [project.currentStep]: {
          ...step,
          inputs: { ...step.inputs, [key]: value },
        },
      },
    });
  }

  function updateDraft(value: string) {
    onProjectChange({
      ...project,
      steps: {
        ...project.steps,
        [project.currentStep]: { ...step, draft: value },
      },
    });
  }

  function writeDraftForStep(projectId: string, stepId: TemplateId, value: string) {
    if (onStepDraftChange) {
      onStepDraftChange(projectId, stepId, value);
      return;
    }

    onProjectChange({
      ...project,
      steps: {
        ...project.steps,
        [stepId]: { ...project.steps[stepId], draft: value },
      },
    });
  }

  function updateStepGeneration(stepId: TemplateId, patch: Partial<StepGenerationState>) {
    setGenerationByStep((current) => ({
      ...current,
      [stepId]: {
        isCalling: false,
        status: "",
        progress: null,
        ...current[stepId],
        ...patch,
      },
    }));
  }

  function applyTopicRecommendation(recommendation: TopicRecommendation) {
    updateInput("outline", recommendation.outline);
    setStatus(`已填入题材：${recommendation.title}`);
  }

  async function loadTopicRecommendations() {
    const fallbackItems = LOCAL_TREND_TOPIC_RECOMMENDATIONS;
    setTopicRecommendations({
      isLoading: true,
      source: "local",
      items: fallbackItems,
      message: "正在在线刷新题材推荐...",
    });

    const prompt = [
      "你是中文短剧和网文的题材策划助手。",
      "请根据最近一个月抖音和红果平台的常见爆款趋势，生成 3-5 个适合中文小说和短剧改编的题材方向。",
      "要求：必须与时俱进，优先现实主义、烟火气、年代家庭、系统打工升级、萌宝治愈、职场反杀、非遗文旅等正向题材；避免封建迷信、低俗擦边、暴力血腥、拜金炫富、校园早恋、悬疑犯罪主线。",
      "输出 JSON 数组，每项包含 title, summary, outline, tags。不要输出解释，不要 Markdown。",
    ].join("\n");

    try {
      const result = cleanAiTextOutput(await callAi(aiSettings, prompt));
      const parsed = JSON.parse(result) as TopicRecommendation[];
      const normalized = Array.isArray(parsed)
        ? parsed
            .map((item) => ({
              title: String(item?.title || "").trim(),
              summary: String(item?.summary || "").trim(),
              outline: String(item?.outline || "").trim(),
              tags: Array.isArray(item?.tags) ? item.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
            }))
            .filter((item) => item.title && item.summary && item.outline)
        : [];

      setTopicRecommendations({
        isLoading: false,
        source: normalized.length > 0 ? "ai" : "local",
        items: normalized.length > 0 ? normalized : fallbackItems,
        message: normalized.length > 0 ? "已使用 AI 在线更新题材推荐。" : "AI 推荐结果为空，已切换到本地题材池。",
      });
    } catch (error) {
      setTopicRecommendations({
        isLoading: false,
        source: "local",
        items: fallbackItems,
        message: "在线推荐暂不可用，已自动切换到本地爆款题材池。请确认 API Key、模型名和本地代理后可再次刷新。",
      });
    }
  }

  function continueToProseGeneration() {
    const chapters = extractChapterOptions(step.draft);
    if (chapters.length === 0) {
      setStatus("请先生成或粘贴章节拆分结果");
      return;
    }

    const firstChapter = chapters[0];
    onProjectChange({
      ...project,
      currentStep: "prose-generation",
      steps: {
        ...project.steps,
        "prose-generation": {
          ...project.steps["prose-generation"],
          inputs: {
            ...project.steps["prose-generation"].inputs,
            storySetting:
              project.steps["prose-generation"].inputs.storySetting ||
              project.steps["chapter-split"].inputs.storySetting ||
              "",
            chapterNumber: firstChapter.number,
            chapterOutline: firstChapter.outline,
          },
        },
      },
    });
  }

  function selectChapterForProse(chapterNumber: string) {
    const selectedChapter = chapterOptions.find((chapter) => chapter.number === chapterNumber);
    if (!selectedChapter) return;

    onProjectChange({
      ...project,
      steps: {
        ...project.steps,
        "prose-generation": {
          ...project.steps["prose-generation"],
          inputs: {
            ...project.steps["prose-generation"].inputs,
            storySetting:
              project.steps["prose-generation"].inputs.storySetting ||
              project.steps["chapter-split"].inputs.storySetting ||
              "",
            chapterNumber: selectedChapter.number,
            chapterOutline: selectedChapter.outline,
          },
        },
      },
    });
  }

  function getNextNovelChapterNumber(draft: string) {
    const chapterNumbers = extractChapterOptions(draft)
      .map((chapter) => Number.parseInt(chapter.number, 10))
      .filter((number) => Number.isFinite(number) && number > 0);
    return chapterNumbers.length > 0 ? Math.max(...chapterNumbers) + 1 : 1;
  }

  function getNovelChapterBlock(draft: string, chapterNumber: string) {
    const escapedChapter = chapterNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(^|\\n)(第\\s*${escapedChapter}\\s*[章节回集][\\s\\S]*?)(?=\\n\\s*第\\s*[0-9一二三四五六七八九十百]+\\s*[章节回集]|$)`,
      "i",
    );
    const match = draft.match(pattern);
    return match?.[2]?.trim() ?? "";
  }

  function replaceNovelChapterBlock(draft: string, chapterNumber: string, replacement: string) {
    const escapedChapter = chapterNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(^|\\n)(第\\s*${escapedChapter}\\s*[章节回集][\\s\\S]*?)(?=\\n\\s*第\\s*[0-9一二三四五六七八九十百]+\\s*[章节回集]|$)`,
      "i",
    );
    if (!pattern.test(draft)) return [draft.trim(), replacement.trim()].filter(Boolean).join("\n\n");
    return draft.replace(pattern, (_match, prefix) => `${prefix}${replacement.trim()}`).trim();
  }

  async function runNovelContinuation() {
    const runProjectId = project.id;
    const runStepId = project.currentStep;
    const nextChapter = getNextNovelChapterNumber(step.draft);
    const chapterWords = step.inputs.chapterWords || "2500";
    const totalChapters = step.inputs.totalChapters || "20";
    const outline = step.inputs.outline || "";
    if (!outline.trim()) {
      setStatus("请先填写或导入故事大纲");
      return;
    }

    updateStepGeneration(runStepId, {
      isCalling: true,
      progress: { label: `续写第${nextChapter}章`, percent: 20 },
      status: "正在续写下一章...",
    });
    try {
      const continuationPrompt = [
        `续写第${nextChapter}章。`,
        `总章数：${totalChapters}`,
        `单章目标字数：${chapterWords}`,
        `文风：${step.inputs.style || "贴合大纲气质"}`,
        `叙事视角：${step.inputs.perspective || "第三人称"}`,
        "自我评分目标：主流商业小说95分以上，低于95分请自动精修后再输出。",
        "",
        "故事大纲：",
        outline,
        "",
        "已生成正文：",
        step.draft || "尚未生成正文，请从第1章开始。",
        "",
        "输出要求：只输出本次续写的单章正文，不要重复前文；章节标题必须以“第N章：”开头；末尾保留“本章自评分：95+”。",
      ].join("\n");
      updateStepGeneration(runStepId, { progress: { label: "等待模型续写", percent: 65 } });
      startTextProgressTimer(runStepId, "等待模型续写", 65, 92);
      const result = cleanAiTextOutput(await callAi(aiSettings, continuationPrompt));
      stopTextProgressTimer(runStepId);
      const nextDraft = [step.draft.trim(), result].filter(Boolean).join("\n\n");
      updateStepGeneration(runStepId, { progress: { label: "写入续写章节", percent: 90 } });
      writeDraftForStep(runProjectId, runStepId, nextDraft);
      updateStepGeneration(runStepId, {
        progress: { label: "续写完成", percent: 100 },
        status: `第${nextChapter}章已追加到结果区`,
      });
    } catch (error) {
      stopTextProgressTimer(runStepId);
      updateStepGeneration(runStepId, {
        progress: { label: "续写失败", percent: 100 },
        status: error instanceof Error ? error.message : "AI 续写失败",
      });
    } finally {
      updateStepGeneration(runStepId, { isCalling: false });
    }
  }

  async function runNovelChapterRevision() {
    const runProjectId = project.id;
    const runStepId = project.currentStep;
    const chapterNumber = step.inputs.reviseChapter || "1";
    const chapterBlock = getNovelChapterBlock(step.draft, chapterNumber);
    if (!step.draft.trim()) {
      setStatus("请先生成或粘贴小说正文");
      return;
    }
    if (!chapterBlock) {
      setStatus(`没有找到第${chapterNumber}章，请检查章节编号`);
      return;
    }

    updateStepGeneration(runStepId, {
      isCalling: true,
      progress: { label: `优化第${chapterNumber}章`, percent: 20 },
      status: "正在优化选中章节...",
    });
    try {
      const revisionPrompt = [
        `优化第${chapterNumber}章。`,
        `单章目标字数：${step.inputs.chapterWords || "2500"}`,
        `文风：${step.inputs.style || "贴合大纲气质"}`,
        "目标：把该章优化到主流商业小说95分以上。",
        "优化重点：强钩子、冲突压迫、爽点递进、人物动机、对话自然、结尾留钩、减少废话。",
        "",
        "全书大纲：",
        step.inputs.outline || "",
        "",
        "当前需要优化的章节：",
        chapterBlock,
        "",
        "输出要求：只输出优化后的本章完整正文，标题仍以“第N章：”开头；不要输出解释；末尾保留“本章自评分：95+”。",
      ].join("\n");
      updateStepGeneration(runStepId, { progress: { label: "等待模型优化", percent: 65 } });
      startTextProgressTimer(runStepId, "等待模型优化", 65, 92);
      const result = cleanAiTextOutput(await callAi(aiSettings, revisionPrompt));
      stopTextProgressTimer(runStepId);
      const nextDraft = replaceNovelChapterBlock(step.draft, chapterNumber, result);
      updateStepGeneration(runStepId, { progress: { label: "替换优化章节", percent: 90 } });
      writeDraftForStep(runProjectId, runStepId, nextDraft);
      updateStepGeneration(runStepId, {
        progress: { label: "优化完成", percent: 100 },
        status: `第${chapterNumber}章已优化`,
      });
    } catch (error) {
      stopTextProgressTimer(runStepId);
      updateStepGeneration(runStepId, {
        progress: { label: "优化失败", percent: 100 },
        status: error instanceof Error ? error.message : "AI 优化失败",
      });
    } finally {
      updateStepGeneration(runStepId, { isCalling: false });
    }
  }

  function clearResults() {
    updateDraft("");
    if (project.currentStep === "asset-extraction") setAssetImageResults([]);
    if (project.currentStep === "gpt-image2-storyboard") setStoryboardImageResults([]);
    setStatus("已清空当前结果区");
  }

  function clearCustomImagePrompts() {
    setCustomImagePrefix(DEFAULT_CUSTOM_IMAGE_PREFIX);
    setCustomImagePrompt("");
    setStatus("已清空自定义提示词");
  }

  function refreshAssetLibrary() {
    setAssetLibraryItems(loadAssetLibrary());
  }

  function setAssetLibraryPage(type: AssetLibraryType, nextPage: number) {
    const totalPages = Math.max(1, Math.ceil(filteredAssetLibraryGroups[type].length / 4));
    setAssetLibraryPageByType((current) => ({ ...current, [type]: Math.max(0, Math.min(nextPage, totalPages - 1)) }));
  }

  function clearAssetImageResults() {
    setAssetImageResults([]);
    setStatus("已清空资产生图结果");
  }

  function deleteImageResult(imageId: string) {
    setAssetImageResults((current) => current.filter((image) => image.id !== imageId));
    setStoryboardImageResults((current) => current.filter((image) => image.id !== imageId));
    setStatus("已删除图片");
  }

  function saveImageResultToAssetLibrary(image: ImageResult) {
    const saved = addAssetLibraryItem({
      type: image.assetType,
      name: image.assetName,
      src: image.src,
      prompt: image.prompt,
      model: image.model,
      ratio: image.ratio,
      resolution: image.resolution,
      saveDirectory: assetLibrarySaveDirectory,
    });
    setAssetLibraryItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setStatus(`已保存到资产库：${saved.name}`);
  }

  async function importAssetLibraryFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    const imported = await Promise.all(
      list.map(async (file) => {
        const src = await fileToDataUrl(file);
        return addAssetLibraryItem({
          type: assetLibraryImportType,
          name: assetLibraryImportName.trim() || file.name.replace(/\.[^.]+$/, ""),
          src,
          prompt: "",
          model: "",
          ratio: "",
          resolution: "",
          saveDirectory: assetLibrarySaveDirectory,
        });
      }),
    );

    setAssetLibraryItems((current) => [...imported, ...current]);
    setStatus(`已导入 ${imported.length} 张图片到资产库`);
    setAssetLibraryImportName("");
  }

  function deleteAssetLibraryEntry(id: string) {
    deleteAssetLibraryItem(id);
    setAssetLibraryItems((current) => current.filter((item) => item.id !== id));
    setEditingAssetNames((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setStatus("已删除资产库图片");
  }

  function renameAssetLibraryEntry(id: string, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    const updated = updateAssetLibraryItem(id, { name: trimmed });
    if (!updated) return;
    setAssetLibraryItems((current) => current.map((item) => (item.id === id ? updated : item)));
    setEditingAssetNames((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setStatus(`已重命名为：${trimmed}`);
  }

  function deleteExtractedAsset(asset: ExtractedAsset) {
    const nextDraft = step.draft
      .split(/\r?\n/)
      .filter((line) => {
        const parsedAsset = extractAssetsFromDraft(line, step.inputs)[0];
        return !(parsedAsset && parsedAsset.name === asset.name && parsedAsset.type === asset.type);
      })
      .join("\n");

    updateDraft(nextDraft);
    setAssetImageResults((current) => current.filter((image) => image.assetName !== asset.name));
    setStatus(`已删除资产：${asset.name}`);
  }

  function stopImageProgressTimer() {
    if (imageProgressTimerRef.current !== null) {
      window.clearInterval(imageProgressTimerRef.current);
      imageProgressTimerRef.current = null;
    }
  }

  function stopStoryboardImageProgressTimer() {
    if (storyboardImageProgressTimerRef.current !== null) {
      window.clearInterval(storyboardImageProgressTimerRef.current);
      storyboardImageProgressTimerRef.current = null;
    }
  }

  function stopTextProgressTimer(stepId: TemplateId) {
    const timerId = textProgressTimerRefs.current[stepId];
    if (timerId !== undefined) {
      window.clearInterval(timerId);
      delete textProgressTimerRefs.current[stepId];
    }
  }

  function stopAllTextProgressTimers() {
    for (const timerId of Object.values(textProgressTimerRefs.current)) {
      if (timerId !== undefined) window.clearInterval(timerId);
    }
    textProgressTimerRefs.current = {};
  }

  function startTextProgressTimer(stepId: TemplateId, activeLabel: string, basePercent: number, maxPercent: number) {
    stopTextProgressTimer(stepId);
    const startedAt = Date.now();
    textProgressTimerRefs.current[stepId] = window.setInterval(() => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const dynamicPercent = Math.min(maxPercent, basePercent + Math.floor(elapsedSeconds * 3));
      updateStepGeneration(stepId, {
        progress: { label: activeLabel, percent: dynamicPercent },
      });
    }, 300);
  }

  function startImageProgressTimer() {
    stopImageProgressTimer();
    const startedAt = Date.now();
    imageProgressTimerRef.current = window.setInterval(() => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const dynamicPercent = Math.min(96, 28 + Math.floor(elapsedSeconds * 3));
      setProgress((current) => {
        if (!current || current.label !== "模型生图中") return current;
        return { ...current, percent: Math.max(current.percent, dynamicPercent) };
      });
    }, 300);
  }

  function startStoryboardImageProgressTimer() {
    stopStoryboardImageProgressTimer();
    const startedAt = Date.now();
    storyboardImageProgressTimerRef.current = window.setInterval(() => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const dynamicPercent = Math.min(96, 28 + Math.floor(elapsedSeconds * 3));
      setStoryboardImageProgress((current) => {
        if (!current || current.label !== "模型生图中") return current;
        return { ...current, percent: Math.max(current.percent, dynamicPercent) };
      });
    }, 300);
  }

  async function copyText(text: string, label: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        copyTextWithFallback(text);
      }
      setStatus(`${label}已复制`);
    } catch (error) {
      try {
        copyTextWithFallback(text);
        setStatus(`${label}已复制`);
      } catch {
        setStatus(error instanceof Error ? `${label}复制失败：${error.message}` : `${label}复制失败`);
      }
    }
  }

  function copyTextWithFallback(text: string) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) {
      throw new Error("浏览器拒绝写入剪贴板");
    }
  }

  function downloadTextFile(content: string, suffix: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.name || "novel-script"}-${template.name}-${suffix}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadImageFile(src: string, filename: string) {
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("图片已开始下载");
    } catch (error) {
      setStatus(error instanceof Error ? `图片下载失败：${error.message}` : "图片下载失败");
    }
  }

  function openImagePreview(src: string, alt: string, filename: string, image?: ImageResult) {
    setPreviewImage({ src, alt, filename, image });
    setPreviewScale(1);
  }

  function prepareImageDrag(event: React.DragEvent<HTMLImageElement>, image: ImageResult, filename: string) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/uri-list", image.src);
    event.dataTransfer.setData("text/plain", image.src);
    event.dataTransfer.setData("application/x-xiaotu-asset-image", JSON.stringify({ ...image, filename }));
    event.dataTransfer.setData("DownloadURL", `image/png:${filename}:${image.src}`);

    const file = createFileFromDataUrl(image.src, filename);
    if (file) {
      event.dataTransfer.items.add(file);
    }
  }

  function createFileFromDataUrl(src: string, filename: string): File | null {
    const match = src.match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!match) return null;
    const mimeType = match[1] || "image/png";
    const isBase64 = Boolean(match[2]);
    const payload = match[3] || "";
    const binaryString = isBase64 ? atob(payload) : decodeURIComponent(payload);
    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }
    return new File([bytes], filename, { type: mimeType });
  }

  function zoomPreviewImage() {
    setPreviewScale((current) => Math.min(4, current + 1));
  }

  async function upscaleImageResult(image: ImageResult, targetResolution: "2K" | "4K") {
    setUpscalingImageId(image.id);
    setStatus(`正在生成 ${targetResolution} 高清放大图...`);
    setUpscaleStatus(`正在生成 ${targetResolution} 高清放大图...`);
    stopImageProgressTimer();
    setProgress({ label: `准备${targetResolution}高清放大`, percent: 10 });
    setUpscaleProgress({ label: `准备${targetResolution}高清放大`, percent: 10 });

    try {
      const imageModel = "gemini-3.1-flash-preview";
      const imageRatio = image.ratio || step.inputs.imageRatio || "16:9";
      const imageCall = resolveImageCallSettings(imageModel);
      const originalPrompt = image.prompt.trim() || "无";
      const upscalePrompt = [
        `请基于以下原图生成一张${targetResolution}高清放大版本，保持角色/场景/物品主体、构图、风格、服装、材质和光影一致。`,
        "提升细节清晰度、边缘锐度、纹理层次和整体画面完成度，不要改变身份、脸型、服装、道具、场景结构，不要添加文字、水印、logo。",
        `原图参考：${image.src}`,
        "原始提示词：",
        originalPrompt,
      ].join("\n");

      setProgress({ label: `发送${targetResolution}高清放大请求`, percent: 22 });
      setUpscaleProgress({ label: `发送${targetResolution}高清放大请求`, percent: 22 });
      startImageProgressTimer();
      const result = await callImageGenerationWithRetry(
        imageCall.settings,
        upscalePrompt,
        imageCall.model,
        imageRatio,
        targetResolution,
        (attempt, delaySeconds) => {
          setStatus(`${targetResolution}高清放大触发限流，${delaySeconds}秒后自动重试第${attempt}次...`);
          setProgress({ label: `限流等待重试 ${attempt}`, percent: 42 });
          setUpscaleStatus(`${targetResolution}高清放大触发限流，${delaySeconds}秒后自动重试第${attempt}次...`);
          setUpscaleProgress({ label: `限流等待重试 ${attempt}`, percent: 42 });
        },
      );

      stopImageProgressTimer();
      setProgress({ label: `接收${targetResolution}高清图`, percent: 90 });
      setUpscaleProgress({ label: `接收${targetResolution}高清图`, percent: 90 });
      const upscaledImages = parseImageResults(result, `${image.assetName}-${targetResolution}高清`, {
        assetType: image.assetType,
        prompt: upscalePrompt,
        model: imageCall.model,
        ratio: imageRatio,
        resolution: targetResolution,
      });

      if (upscaledImages.length === 0) {
        setStatus(NO_PREVIEWABLE_IMAGE_MESSAGE);
        setUpscaleStatus(NO_PREVIEWABLE_IMAGE_MESSAGE);
      } else {
        appendImageResultLike(image.id, upscaledImages);
        setPreviewImage(null);
        setStatus(`${targetResolution}高清放大图已追加到原图后方，原图已保留`);
        setUpscaleStatus(`${targetResolution}高清放大图已追加到原图后方，原图已保留`);
      }
      setProgress({ label: `${targetResolution}高清放大完成`, percent: 100 });
      setUpscaleProgress({ label: `${targetResolution}高清放大完成`, percent: 100 });
    } catch (error) {
      stopImageProgressTimer();
      setProgress({ label: `${targetResolution}高清放大失败`, percent: 100 });
      setStatus(error instanceof Error ? error.message : `${targetResolution}高清放大失败`);
      setUpscaleProgress({ label: `${targetResolution}高清放大失败`, percent: 100 });
      setUpscaleStatus(error instanceof Error ? error.message : `${targetResolution}高清放大失败`);
    } finally {
      setUpscalingImageId(null);
    }
  }

  function appendImageResultLike(sourceImageId: string, upscaledImages: ImageResult[]) {
    const appendAfterSource = (current: ImageResult[]) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceImageId);
      if (sourceIndex === -1) return current;
      return [
        ...current.slice(0, sourceIndex + 1),
        ...upscaledImages,
        ...current.slice(sourceIndex + 1),
      ];
    };
    setAssetImageResults((current) => {
      return appendAfterSource(current);
    });
    setStoryboardImageResults((current) => {
      return appendAfterSource(current);
    });
  }

  function resolveImageCallSettings(imageModel: string) {
    const selectedImageModel = imageModel.trim();
    if (!selectedImageModel.startsWith("gemini-")) {
      return { settings: aiSettings, model: selectedImageModel || imageModel };
    }
    const resolvedGeminiModel = selectedImageModel || aiSettings.geminiImageModel?.trim() || "gemini-3.1-flash-preview";

    return {
      settings: {
        endpoint: aiSettings.geminiImageEndpoint?.trim() || aiSettings.endpoint,
        apiKey: aiSettings.geminiImageApiKey?.trim() || aiSettings.apiKey,
        model: resolvedGeminiModel,
        geminiImageEndpoint: aiSettings.geminiImageEndpoint,
        geminiImageApiKey: aiSettings.geminiImageApiKey,
        geminiImageModel: aiSettings.geminiImageModel,
      },
      model: resolvedGeminiModel,
    };
  }

  function isRateLimitError(error: unknown) {
    return error instanceof Error && /HTTP 429|限流|额度限制/.test(error.message);
  }

  function wait(milliseconds: number) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function callImageGenerationWithRetry(
    settings: AiSettings,
    prompt: string,
    model: string,
    ratio: string,
    resolution: string,
    onRetry?: (attempt: number, delaySeconds: number) => void,
  ) {
    const retryDelays = [3500, 9000];
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        return await callImageGeneration(settings, prompt, model, ratio, resolution);
      } catch (error) {
        if (!isRateLimitError(error) || attempt >= retryDelays.length) throw error;
        const delay = retryDelays[attempt];
        onRetry?.(attempt + 1, Math.ceil(delay / 1000));
        await wait(delay);
      }
    }
    throw new Error("生图调用失败");
  }

  function readTextFile(file: File) {
    if (typeof file.text === "function") return file.text();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function importTextFile(file: File | undefined, targetField = "scriptText") {
    if (!file) return;
    const content = await readTextFile(file);
    updateInput(targetField, content);
    setStatus(`已导入：${file.name}`);
  }

  function getMissingRequiredFields() {
    return template.fields
      .filter((field) => field.required)
      .filter((field) => !String(step.inputs[field.key] ?? field.defaultValue ?? "").trim())
      .map((field) => field.label);
  }

  function cleanAiTextOutput(value: string) {
    return value
      .replace(/<\s*(think|thinking|reasoning)\s*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/^\s*_::~(?:OUTPUT_START|OUTPUT_END|FIELD|RECORD)::~_\s*$/gim, "")
      .replace(/^\s*(?:```(?:text|markdown|md)?\s*)/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
  }

  function getExpectedChapterCount(inputs: Record<string, string>) {
    const value = Number.parseInt(String(inputs.totalChapters ?? ""), 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function getMissingChapterRange(draft: string, expectedCount: number) {
    const generatedNumbers = new Set(
      extractChapterOptions(draft)
        .map((chapter) => Number.parseInt(chapter.number, 10))
        .filter((number) => Number.isFinite(number) && number > 0),
    );
    const missingNumbers = Array.from({ length: expectedCount }, (_, index) => index + 1).filter(
      (number) => !generatedNumbers.has(number),
    );

    if (missingNumbers.length === 0) return null;
    return {
      start: missingNumbers[0],
      end: missingNumbers[missingNumbers.length - 1],
    };
  }

  async function ensureCompleteChapterSplit(
    initialResult: string,
    originalPrompt: string,
    inputs: Record<string, string>,
    stepId: TemplateId,
  ) {
    const expectedCount = getExpectedChapterCount(inputs);
    if (!expectedCount) return initialResult;

    let combinedResult = initialResult.trim();
    const maxContinuationAttempts = Math.min(Math.max(Math.ceil(expectedCount / 2), 4), 12);
    for (let attempt = 0; attempt < maxContinuationAttempts; attempt += 1) {
      const missingRange = getMissingChapterRange(combinedResult, expectedCount);
      if (!missingRange) break;

      updateStepGeneration(stepId, {
        progress: { label: `补齐第${missingRange.start}-${missingRange.end}章`, percent: Math.min(72 + attempt * 6, 84) },
        status: `检测到章节未满 ${expectedCount} 章，正在继续补齐...`,
      });

      const continuationPrompt = [
        "继续补齐章节拆分。",
        "这是原始章节拆分要求：",
        originalPrompt,
        "",
        "当前已经生成：",
        combinedResult,
        "",
        `请从第${missingRange.start}章继续输出到第${missingRange.end}章。`,
        "不要重复已经生成的章节，不要总结，不要解释，只输出缺失章节。",
        "保持与前文相同格式、标题粒度、剧情连贯性和章节信息密度。",
      ].join("\n");
      const continuationResult = cleanAiTextOutput(await callAi(aiSettings, continuationPrompt));
      combinedResult = [combinedResult, continuationResult].filter(Boolean).join("\n\n");
    }

    const remainingRange = getMissingChapterRange(combinedResult, expectedCount);
    if (remainingRange) {
      combinedResult = [
        combinedResult,
        "",
        `【系统提醒】当前章节拆分仍缺少第${remainingRange.start}章到第${remainingRange.end}章，请再次点击“调用 AI 生成”或降低总章数后重试。`,
      ].join("\n");
    }

    return combinedResult;
  }

  function getTextAiSettingsForStep(stepId: TemplateId): AiSettings {
    if (stepId !== "gpt-image2-storyboard") return aiSettings;
    const normalizedEndpoint = aiSettings.endpoint.trim().replace(/\/+$/, "");
    if (normalizedEndpoint !== "https://timeai.chat/v1") return aiSettings;
    return { ...aiSettings, endpoint: "/api/timeai/v1" };
  }

  async function runAi() {
    const runProjectId = project.id;
    const runStepId = project.currentStep;
    const runPrompt = prompt;
    const runInputs = { ...project.steps[runStepId].inputs };
    const missingFields = getMissingRequiredFields();
    if (missingFields.length > 0) {
      setStatus(`请先填写：${missingFields.join("、")}`);
      return;
    }

    updateStepGeneration(runStepId, {
      isCalling: true,
      progress: { label: "准备提示词", percent: 15 },
      status: "正在调用 AI...",
    });
    try {
      updateStepGeneration(runStepId, { progress: { label: "发送请求", percent: 35 } });
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      updateStepGeneration(runStepId, { progress: { label: "等待模型生成", percent: 65 } });
      startTextProgressTimer(runStepId, "等待模型生成", 65, 92);
      let initialResult = "";
      const textAiSettings = getTextAiSettingsForStep(runStepId);
      if (runStepId === "storyboard-15s") {
        let streamedDraft = "";
        const streamedResult = await callAiStream(
          textAiSettings,
          runPrompt,
          (chunk) => {
            streamedDraft += chunk;
            writeDraftForStep(runProjectId, runStepId, streamedDraft);
          },
        );
        initialResult = cleanAiTextOutput(streamedResult);
      } else {
        initialResult = cleanAiTextOutput(await callAi(textAiSettings, runPrompt));
      }
      stopTextProgressTimer(runStepId);
      if (!initialResult.trim()) {
        throw new Error("AI 返回内容为空，请检查模型是否只返回了思考过程或更换模型重试。");
      }
      const result =
        runStepId === "chapter-split"
          ? await ensureCompleteChapterSplit(initialResult, runPrompt, runInputs, runStepId)
          : initialResult;
      if (!result.trim()) {
        throw new Error("AI 返回内容为空，请检查模型是否只返回了思考过程或更换模型重试。");
      }
      updateStepGeneration(runStepId, { progress: { label: "写入草稿", percent: 90 } });
      writeDraftForStep(runProjectId, runStepId, result);
      updateStepGeneration(runStepId, {
        progress: { label: "生成完成", percent: 100 },
        status: "AI 结果已放入草稿区",
      });
    } catch (error) {
      stopTextProgressTimer(runStepId);
      const message = error instanceof Error ? error.message : "AI 调用失败";
      const friendlyMessage =
        /HTTP 524/.test(message)
          ? "AI 调用超时：HTTP 524。请缩短输入内容或切换响应更快的模型/接口。"
          : message;
      updateStepGeneration(runStepId, {
        progress: { label: "生成失败", percent: 100 },
        status: friendlyMessage,
      });
    } finally {
      updateStepGeneration(runStepId, { isCalling: false });
    }
  }

  async function sendCurrentStoryboardToZzdh() {
    if (project.currentStep !== "storyboard-15s") return;
    if (!step.draft.trim()) {
      setStatus("请先生成或粘贴15S分镜脚本，再发送到字字动画。");
      return;
    }

    setIsSendingToZzdh(true);
    setStatus("正在发送到字字动画...");
    try {
      await sendStoryboardToZzdh(project.name, step.draft);
      setStatus("已发送到字字动画，并自动创建/打开项目");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "发送到字字动画失败");
    } finally {
      setIsSendingToZzdh(false);
    }
  }

  async function sendCurrentAssetsToZzdh() {
    if (project.currentStep !== "asset-extraction") return;
    const assets = extractedAssets.map(withEditedAssetDescription);
    if (assets.length === 0) {
      setStatus("请先提取人物、场景或物品资产，再发送到字字动画。");
      return;
    }

    setIsSendingAssetsToZzdh(true);
    setStatus("正在发送资产到字字动画...");
    try {
      const result = await sendAssetsToZzdh(assets);
      const failedText = result.failed.length > 0 ? `，失败 ${result.failed.length} 个` : "";
      setStatus(`已发送到字字动画：新建 ${result.created.length} 个，跳过同名 ${result.skippedExisting.length} 个${failedText}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "发送资产到字字动画失败");
    } finally {
      setIsSendingAssetsToZzdh(false);
    }
  }

  function withEditedAssetDescription(asset: ExtractedAsset) {
    return {
      ...asset,
      description: editedAssetDescriptions[asset.id] ?? asset.description,
    };
  }

  async function runImageGeneration(asset?: ExtractedAsset) {
    const generationAsset = asset ? withEditedAssetDescription(asset) : undefined;
    if (asset) {
      setGeneratingAssets((current) => ({ ...current, [asset.id]: true }));
    } else {
      setIsGeneratingImage(true);
    }
    setStatus("正在调用生图模型...");
    if (!asset) setAssetImageResults([]);
    stopImageProgressTimer();
    setProgress({ label: "准备生图参数", percent: 8 });
    try {
      const imageModel = step.inputs.imageModel ?? "gpt-image-2";
      const imageRatio = step.inputs.imageRatio ?? "16:9";
      const imageResolution = step.inputs.imageResolution ?? "1K";
      const imagePrompt = buildImageGenerationPrompt(step.inputs, generationAsset);
      const imageCall = resolveImageCallSettings(imageModel);
      setProgress({ label: "发送生图请求", percent: 18 });
      setProgress({ label: "模型生图中", percent: 28 });
      startImageProgressTimer();
      const result = await callImageGenerationWithRetry(
        imageCall.settings,
        imagePrompt,
        imageCall.model,
        imageRatio,
        imageResolution,
        (attempt, delaySeconds) => {
          setStatus(`触发生图限流，${delaySeconds}秒后自动重试第${attempt}次...`);
          setProgress({ label: `限流等待重试 ${attempt}`, percent: 42 });
        },
      );
      stopImageProgressTimer();
      setProgress({ label: "接收图片结果", percent: 90 });
      const images = parseImageResults(result, generationAsset?.name ?? "资产", {
        assetType: (generationAsset?.type ?? step.inputs.assetType ?? "人物") as AssetLibraryType,
        prompt: imagePrompt,
        model: imageCall.model,
        ratio: imageRatio,
        resolution: imageResolution,
      });
      setProgress({ label: "解析预览图片", percent: 96 });
      setAssetImageResults((current) => {
        if (!generationAsset) return images;
        return [...current.filter((item) => item.assetName !== generationAsset.name), ...images];
      });
      setProgress({ label: "生图完成", percent: 100 });
      setStatus(images.length > 0 ? "生图结果已生成，可预览和下载" : NO_PREVIEWABLE_IMAGE_MESSAGE);
    } catch (error) {
      stopImageProgressTimer();
      setProgress({ label: "生图失败", percent: 100 });
      setStatus(error instanceof Error ? error.message : "生图调用失败");
    } finally {
      if (asset) {
        setGeneratingAssets((current) => ({ ...current, [asset.id]: false }));
      } else {
        setIsGeneratingImage(false);
      }
    }
  }

  async function runBatchImageGeneration() {
    const assets = extractedAssets.map(withEditedAssetDescription);
    if (assets.length === 0) {
      setStatus("请先在生成结果区放入可识别的资产内容");
      return;
    }

    setIsGeneratingImage(true);
    setGeneratingAssets((current) => ({
      ...current,
      ...Object.fromEntries(assets.map((asset) => [asset.id, true])),
    }));
    setStatus(`正在排队生成 ${assets.length} 个资产图片，限流时会自动重试...`);
    setAssetImageResults([]);
    stopImageProgressTimer();
    setProgress({ label: "准备批量生图参数", percent: 8 });

    try {
      const imageModel = step.inputs.imageModel ?? "gpt-image-2";
      const imageRatio = step.inputs.imageRatio ?? "16:9";
      const imageResolution = step.inputs.imageResolution ?? "1K";
      const imageCall = resolveImageCallSettings(imageModel);
      setProgress({ label: "排队发送生图请求", percent: 18 });
      setProgress({ label: "模型生图中", percent: 28 });
      startImageProgressTimer();
      const groupedResults: ImageResult[] = [];
      let batchImageIndex = 0;
      const failedMessages: string[] = [];
      for (let assetIndex = 0; assetIndex < assets.length; assetIndex += 1) {
        const asset = assets[assetIndex];
        try {
          setStatus(`正在生成资产 ${assetIndex + 1}/${assets.length}：${asset.name}`);
          setProgress({
            label: `生成 ${assetIndex + 1}/${assets.length}`,
            percent: Math.min(88, 28 + Math.floor((assetIndex / assets.length) * 55)),
          });
          const imagePrompt = buildImageGenerationPrompt(step.inputs, asset);
          const result = await callImageGenerationWithRetry(
            imageCall.settings,
            imagePrompt,
            imageCall.model,
            imageRatio,
            imageResolution,
            (attempt, delaySeconds) => {
              setStatus(`资产“${asset.name}”触发限流，${delaySeconds}秒后自动重试第${attempt}次...`);
              setProgress({
                label: `限流等待 ${assetIndex + 1}/${assets.length}`,
                percent: Math.min(88, 32 + Math.floor((assetIndex / assets.length) * 55)),
              });
            },
          );
          const images = parseImageResults(result, asset.name, {
            assetType: asset.type as AssetLibraryType,
            prompt: imagePrompt,
            model: imageCall.model,
            ratio: imageRatio,
            resolution: imageResolution,
          });
          const indexedImages = images.map((image) => ({
            ...image,
            id: `${image.id}-${++batchImageIndex}`,
          }));
          groupedResults.push(...indexedImages);
          setAssetImageResults((current) => {
            const remaining = current.filter((item) => item.assetName !== asset.name);
            return [...remaining, ...indexedImages];
          });
        } catch (error) {
          failedMessages.push(error instanceof Error ? `“${asset.name}”：${error.message}` : `“${asset.name}”：生图失败`);
        } finally {
          setGeneratingAssets((current) => ({ ...current, [asset.id]: false }));
        }
      }
      stopImageProgressTimer();
      setProgress({ label: "接收图片结果", percent: 90 });
      setProgress({ label: "解析预览图片", percent: 96 });
      setProgress({ label: "生图完成", percent: 100 });
      const images = groupedResults.flat();
      if (failedMessages.length > 0 && images.length > 0) {
        setStatus(`已生成 ${images.length} 张图片，${failedMessages.length} 个资产失败：${failedMessages.join("；")}`);
      } else if (failedMessages.length > 0) {
        setStatus(failedMessages.join("；"));
      } else {
        setStatus(images.length > 0 ? `已完成 ${assets.length} 个资产的排队生图` : NO_PREVIEWABLE_IMAGE_MESSAGE);
      }
    } catch (error) {
      stopImageProgressTimer();
      setProgress({ label: "生图失败", percent: 100 });
      setStatus(error instanceof Error ? error.message : "生图调用失败");
    } finally {
      setGeneratingAssets((current) => ({
        ...current,
        ...Object.fromEntries(assets.map((asset) => [asset.id, false])),
      }));
      setIsGeneratingImage(false);
    }
  }

  async function runCustomPromptImageGeneration() {
    const cleanPrompt = customImagePrompt.trim();
    const prefixPrompt = customImagePrefix.trim();
    const finalPrompt = [prefixPrompt, cleanPrompt].filter(Boolean).join("\n");
    const count = Math.min(12, Math.max(1, Number.parseInt(customImageCount, 10) || 1));
    if (!cleanPrompt) {
      setStatus("请先填写主提示词");
      return;
    }

    setIsGeneratingCustomImages(true);
    setStatus(`正在按自定义提示词排队生成 ${count} 张图片...`);
    stopImageProgressTimer();
    setProgress({ label: "准备自定义生图参数", percent: 8 });

    try {
      const imageModel = step.inputs.imageModel ?? "gpt-image-2";
      const imageRatio = step.inputs.imageRatio ?? "16:9";
      const imageResolution = step.inputs.imageResolution ?? "1K";
      const imageCall = resolveImageCallSettings(imageModel);
      setProgress({ label: "排队发送生图请求", percent: 18 });
      setProgress({ label: "模型生图中", percent: 28 });
      startImageProgressTimer();
      const groupedResults: ImageResult[] = [];
      let customImageIndex = 0;
      const failedMessages: string[] = [];
      for (let index = 0; index < count; index += 1) {
        try {
          setStatus(`正在生成自定义图片 ${index + 1}/${count}`);
          setProgress({
            label: `生成 ${index + 1}/${count}`,
            percent: Math.min(88, 28 + Math.floor((index / count) * 55)),
          });
          const result = await callImageGenerationWithRetry(
            imageCall.settings,
            finalPrompt,
            imageCall.model,
            imageRatio,
            imageResolution,
            (attempt, delaySeconds) => {
              setStatus(`自定义图片 ${index + 1}/${count} 触发限流，${delaySeconds}秒后自动重试第${attempt}次...`);
            },
          );
          const images = parseImageResults(result, "自定义提示词", {
            assetType: "物品",
            prompt: finalPrompt,
            model: imageCall.model,
            ratio: imageRatio,
            resolution: imageResolution,
          });
          const indexedImages = images.map((image) => ({
            ...image,
            id: `${image.id}-${++customImageIndex}`,
          }));
          groupedResults.push(...indexedImages);
          setAssetImageResults((current) => [...current, ...indexedImages]);
        } catch (error) {
          failedMessages.push(error instanceof Error ? `第${index + 1}张：${error.message}` : `第${index + 1}张：生图失败`);
        }
      }
      stopImageProgressTimer();
      setProgress({ label: "接收图片结果", percent: 90 });
      setProgress({ label: "解析预览图片", percent: 96 });
      setProgress({ label: "生图完成", percent: 100 });
      const images = groupedResults.flat();
      if (failedMessages.length > 0 && images.length > 0) {
        setStatus(`已生成 ${images.length} 张图片，${failedMessages.length} 张失败：${failedMessages.join("；")}`);
      } else if (failedMessages.length > 0) {
        setStatus(failedMessages.join("；"));
      } else {
        setStatus(images.length > 0 ? `已完成 ${count} 张自定义提示词图片生成` : NO_PREVIEWABLE_IMAGE_MESSAGE);
      }
    } catch (error) {
      stopImageProgressTimer();
      setProgress({ label: "生图失败", percent: 100 });
      setStatus(error instanceof Error ? error.message : "生图调用失败");
    } finally {
      setIsGeneratingCustomImages(false);
    }
  }

  async function runStoryboardImageGeneration() {
    const storyboardPrompt = buildStoryboardImagePrompt();
    if (!storyboardPrompt.trim()) {
      setStoryboardImageStatus("请先生成或粘贴 GPT-image2 故事板提示词");
      return;
    }

    setIsGeneratingImage(true);
    setStoryboardImageStatus("正在生成故事板图片...");
    stopStoryboardImageProgressTimer();
    setStoryboardImageProgress({ label: "准备故事板出图参数", percent: 8 });

    try {
      const imageRatio = step.inputs.imageRatio ?? "16:9";
      const imageResolution = step.inputs.imageResolution ?? "1K";
      const imageModel = step.inputs.imageModel ?? "gpt-image-2";
      const imageCall = resolveImageCallSettings(imageModel);
      setStoryboardImageProgress({ label: "发送故事板生图请求", percent: 18 });
      setStoryboardImageProgress({ label: "模型生图中", percent: 28 });
      startStoryboardImageProgressTimer();
      const result = await callImageGenerationWithRetry(
        imageCall.settings,
        storyboardPrompt,
        imageCall.model,
        imageRatio,
        imageResolution,
        (attempt, delaySeconds) => {
          setStoryboardImageStatus(`故事板出图触发限流，${delaySeconds}秒后自动重试第${attempt}次...`);
          setStoryboardImageProgress({ label: `限流等待重试 ${attempt}`, percent: 42 });
        },
      );
      stopStoryboardImageProgressTimer();
      setStoryboardImageProgress({ label: "接收故事板图片", percent: 90 });
      const images = parseImageResults(result, "故事板", {
        assetType: "场景",
        prompt: storyboardPrompt,
        model: imageCall.model,
        ratio: imageRatio,
        resolution: imageResolution,
      });
      setStoryboardImageResults(images);
      setStoryboardImageProgress({ label: "故事板出图完成", percent: 100 });
      setStoryboardImageStatus(images.length > 0 ? "故事板图片已生成，可预览和下载" : NO_PREVIEWABLE_IMAGE_MESSAGE);
    } catch (error) {
      stopStoryboardImageProgressTimer();
      setStoryboardImageProgress({ label: "故事板出图失败", percent: 100 });
      setStoryboardImageStatus(error instanceof Error ? error.message : "故事板出图失败");
    } finally {
      setIsGeneratingImage(false);
    }
  }

  function parseImageResults(
    result: string,
    assetName: string,
    metadata: Partial<Pick<ImageResult, "assetType" | "prompt" | "model" | "ratio" | "resolution">> = {},
  ): ImageResult[] {
    return extractPreviewableImageReferences(result)
      .filter(isPreviewableImageReference)
      .slice(0, 1)
      .map((src) => {
        imageResultIdRef.current += 1;
        return {
          id: `image-${imageResultIdRef.current}`,
          src,
          assetName,
          assetType: metadata.assetType ?? "人物",
          prompt: metadata.prompt ?? "",
          model: metadata.model ?? "",
          ratio: metadata.ratio ?? "",
          resolution: metadata.resolution ?? "",
        };
      });
  }

  function extractPreviewableImageReferences(result: string) {
    const references = new Set<string>();
    const add = (value: unknown) => {
      if (typeof value !== "string") return;
      const trimmed = value.trim();
      if (trimmed) references.add(trimmed);
    };
    const walk = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      for (const [key, nestedValue] of Object.entries(value)) {
        if (typeof nestedValue === "string") {
          if (/^(url|image_url|imageUrl|src|href|b64_json|b64Json)$/i.test(key)) {
            add(key.toLowerCase().startsWith("b64") ? `data:image/png;base64,${nestedValue}` : nestedValue);
          }
        } else {
          walk(nestedValue);
        }
      }
    };

    try {
      walk(JSON.parse(result));
    } catch {
      // The gateway may wrap JSON in explanatory text; regex extraction below handles that.
    }

    for (const line of result.split(/\r?\n/)) add(line);
    for (const match of result.matchAll(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g)) add(match[0]);
    for (const match of result.matchAll(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g)) add(match[1]);
    for (const match of result.matchAll(/<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi)) add(match[1]);
    for (const match of result.matchAll(/["'](?:url|image_url|imageUrl|src)["']\s*:\s*["'](https?:\/\/[^"']+)["']/g)) add(match[1]);
    for (const match of result.matchAll(/https?:\/\/[^\s)"'<>]+/gi)) add(match[0].replace(/[，。,.;；\]}]+$/, ""));

    return [...references];
  }

  function isPreviewableImageReference(value: string) {
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value)) return true;
    if (/^blob:/i.test(value)) return true;
    if (!/^https?:\/\//i.test(value)) return false;

    try {
      const url = new URL(value);
      const path = url.pathname.toLowerCase();
      if (/\.(png|jpe?g|webp|gif|avif)$/i.test(path)) return true;

      const full = `${url.hostname}${url.pathname}`.toLowerCase();
      if (/(image|img|cdn|file|asset|media|upload|generated|generation|preview|blob|storage)/i.test(full)) {
        return true;
      }
      return Boolean(url.search);
    } catch {
      return false;
    }
  }

  function extractAssetsFromDraft(draft: string, inputs: Record<string, string>): ExtractedAsset[] {
    const draftLines = draft.split(/\r?\n/);
    const assets: ExtractedAsset[] = [];

    for (let index = 0; index < draftLines.length; index += 1) {
      const line = draftLines[index].trim();
      if (!line) continue;
      const bracketMatch = line.match(/^【(人物|角色|场景|物品|道具)】\s*([^：:，,]+)[：:，,]?\s*(.*)$/);
      const labelMatch = line.match(/^(人物|角色|场景|物品|道具)[：:]\s*([^：:，,]+)[：:，,]?\s*(.*)$/);
      const match = bracketMatch ?? labelMatch;
      if (!match) continue;
      const type = match[1] === "角色" ? "人物" : match[1] === "道具" ? "物品" : match[1];
      const name = match[2].trim();
      if (!name) continue;
      const followingLines: string[] = [];
      for (let nextIndex = index + 1; nextIndex < draftLines.length; nextIndex += 1) {
        const nextLine = draftLines[nextIndex].trim();
        if (!nextLine) continue;
        if (/^(【(人物|角色|场景|物品|道具)】|(人物|角色|场景|物品|道具)[：:])/.test(nextLine)) break;
        followingLines.push(nextLine);
      }
      const description = [match[3]?.trim(), ...followingLines].filter(Boolean).join("\n") || line;
      assets.push({
        id: `${type}-${name}-${assets.length}`,
        name,
        type,
        description,
        lineIndex: index,
      });
    }

    const selectedType = inputs.assetType?.trim();
    if (selectedType === "人物" || selectedType === "场景" || selectedType === "物品") {
      return assets.filter((asset) => asset.type === selectedType);
    }

    return assets;
  }

  function formatExtractedAssetLine(asset: ExtractedAsset, nextDescription: string) {
    const description = nextDescription.trim();
    return description ? `【${asset.type}】${asset.name}：${description}` : `【${asset.type}】${asset.name}`;
  }

  function updateExtractedAssetDescription(asset: ExtractedAsset, nextDescription: string) {
    setEditedAssetDescriptions((current) => ({ ...current, [asset.id]: nextDescription }));
    const lines = step.draft.split(/\r?\n/);
    if (asset.lineIndex < 0 || asset.lineIndex >= lines.length) return;
    const deleteCount = Math.max(1, asset.description.split(/\r?\n/).filter(Boolean).length + 1);
    lines.splice(asset.lineIndex, deleteCount, formatExtractedAssetLine(asset, nextDescription));
    updateDraft(lines.join("\n"));
  }

  function extractChapterOptions(draft: string): ChapterOption[] {
    const lines = draft
      .split(/\r?\n/)
      .map((line) =>
        line
          .trim()
          .replace(/^#{1,6}\s*/, "")
          .replace(/^[-*+]\s+/, "")
          .replace(/^\*\*(.*)\*\*$/, "$1")
          .replace(/^__(.*)__$/, "$1")
          .trim(),
      )
      .filter(Boolean);

    const chapters: ChapterOption[] = [];
    let fallbackNumber = 1;

    for (const line of lines) {
      const match =
        line.match(/^【?第\s*([0-9一二三四五六七八九十百]+)\s*[章节回集]】?[：:、\s-]*(.*)$/) ??
        line.match(/^第\s*([0-9一二三四五六七八九十百]+)\s*[章节回集][：:、\s-]*(.*)$/) ??
        line.match(/^章节\s*([0-9一二三四五六七八九十百]+)[：:、\s-]*(.*)$/) ??
        line.match(/^([0-9]+)[.、：:\s\-）)]\s*(.*)$/);
      if (!match) continue;

      const rawNumber = match[1].trim();
      const number = normalizeChapterNumber(rawNumber) ?? String(fallbackNumber);
      const outline = line;
      const title = (match[2] || outline).split(/[。；;]/)[0].trim() || outline;
      chapters.push({ number, title, outline });
      fallbackNumber += 1;
    }

    if (chapters.length > 0) return chapters;

    return lines.map((line, index) => ({
      number: String(index + 1),
      title: line.split(/[。；;]/)[0].trim() || `章节 ${index + 1}`,
      outline: line,
    }));
  }

  function normalizeChapterNumber(value: string) {
    const normalized = value.replace(/^0+(\d)/, "$1");
    if (/^\d+$/.test(normalized)) return normalized;

    const digitMap: Record<string, number> = {
      零: 0,
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
    };
    if (normalized === "十") return "10";
    if (normalized.startsWith("十")) {
      const ones = digitMap[normalized.slice(1)] ?? 0;
      return String(10 + ones);
    }
    if (normalized.endsWith("十")) {
      const tens = digitMap[normalized.slice(0, -1)] ?? 1;
      return String(tens * 10);
    }
    if (normalized.includes("十")) {
      const [tenPart, onePart] = normalized.split("十");
      const tens = digitMap[tenPart] ?? 1;
      const ones = digitMap[onePart] ?? 0;
      return String(tens * 10 + ones);
    }

    return undefined;
  }

  function buildImageGenerationPrompt(inputs: Record<string, string>, asset?: ExtractedAsset) {
    const sourceText = (asset?.description || inputs.sourceText || "").trim();
    const assetType = (asset?.type || inputs.assetType || "人物").trim();
    const assetTarget = (asset?.name || assetType).trim();
    const visualStyle = (inputs.visualStyle ?? "3D国漫风格").trim();
    const imageRatio = (inputs.imageRatio ?? "16:9").trim();
    const imageResolution = (inputs.imageResolution ?? "1K").trim();

    return [
      "请严格按照以下内容生成单张图片，不要改写为其他题材，不要忽略风格。",
      `画面主体：${assetTarget}`,
      `资产类型：${assetType}`,
      `指定画风：${visualStyle}`,
      `画面比例：${imageRatio}`,
      `目标清晰度：${imageResolution}`,
      "该资产的提取内容：",
      sourceText,
      inputs.sourceText ? `完整原文背景：${inputs.sourceText}` : "",
      ...(assetType === "人物"
        ? [
            "人物统一后缀：横向专业角色设定表。",
            "布局标准：左侧区域为正面面部高清特写，重点展示妆容细节；右侧区域为全身三视图，包含正面、侧面、背面。",
            "人物要求：根据剧情自动补全，但只描述性别和服装，不要出现任何字幕、水印、logo、编号或额外说明。",
          ]
        : []),
      ...(assetType === "场景"
        ? [
            "场景统一后缀：同场景四视角设定图。",
            "版式要求：固定2X2布局，四个画面都必须展示整体场景，不是局部细节，不是单个物品特写；四格保持同一空间、同一时间、同一风格、同一氛围。",
            "1.左上：正面全景，从主入口或正面机位看完整空间，展示核心主体、前中后景、环境结构和主光源。",
            "2.右上：侧向全景，从左侧或右侧机位看完整空间，展示空间纵深、边缘陈设、通道关系和侧逆光。",
            "3.左下：俯视全景，从高处俯瞰完整空间，展示动线、摊位/建筑/家具/道具整体位置和层次关系。",
            "4.右下：反向全景，从场景内部或背面回看完整空间，展示背景出口、远景结构、光影反打和氛围延续。",
            "场景要求：当前剧情时间必须来自原文当前剧情；不要只拍单个物品、不要只拍材质局部、不要把四格画成四个不同地点；不要人物、不要角色、不要主角、不要配角、不要路人、不要人物动作、不要文字、不要字幕、不要水印。",
          ]
        : []),
      ...(assetType === "物品"
        ? [
            "物品统一后缀：电商纯白色背景强约束。",
            "物品格式：纯道具产品图，居中展示，纯白背景，白底棚拍，柔和商品光，真实材质反光。",
            "物品要求：只展示物品本身的外形、材质、颜色、尺寸感、磨损状态和功能；不要人物、不要手持、不要场景环境、不要生活背景、不要文字、不要字幕、不要水印、不要logo。",
          ]
        : []),
      "生成要求：主体必须来自原文和资产提取内容；外貌、服装、场景、道具只从原文提取，原文缺失时保持简洁合理，不要新增无关角色和无关背景。",
      `风格要求：整张图必须统一为${visualStyle}，包括材质、光影、色彩、镜头质感和人物造型。`,
      "构图要求：主体清晰，重点突出，适合直接作为剧本资产图或分镜参考图。",
      "负面限制：不要随机换脸，不要多余文字，不要字幕，不要水印，不要logo，不要畸形手指，不要低清模糊，不要偏离原文内容。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function buildStoryboardImagePrompt() {
    const source = step.draft.trim();
    if (!source) return "";
    const extractedPrompt =
      extractStoryboardImageSection(source) ??
      source.match(/GPT-image-2出图提示词[：:]\s*([\s\S]*)$/)?.[1]?.trim() ??
      source.match(/GPT-image2四宫格单图提示词[：:：]?\s*([\s\S]*)$/)?.[1]?.trim() ??
      source;
    const panelLayout = step.inputs.panelLayout || "四宫格2x2";
    const imageRatio = step.inputs.imageRatio || "16:9";
    const visualStyle = step.inputs.visualStyle || "3D国漫风格";

    return [
      "请严格按照以下 GPT-image2 故事板提示词生成一张故事板图片。",
      `画面布局：${panelLayout}`,
      `画面比例：${imageRatio}`,
      `影像风格：${visualStyle}`,
      "要求：只生成一张图；宫格内不要出现文字、字幕、水印、logo、编号；人物服装、场景、道具保持一致；不要把宫格画成无关场景。",
      "",
      extractedPrompt,
    ].join("\n");
  }

  function extractStoryboardImageSection(source: string) {
    const imageSectionMatch = source.match(/【图片提示词区[^】]*】([\s\S]*?)(?:_::~FIELD::~_|【视频提示词区】)/);
    if (!imageSectionMatch) return null;
    return `【图片提示词区｜对白已明确标注】${imageSectionMatch[1]}`.trim();
  }

  function renderAssetLibraryItemCard(item: AssetLibraryItem) {
    const editingName = editingAssetNames[item.id] ?? item.name;
    return (
      <article className="asset-library-card" key={item.id}>
        <button
          aria-label={`预览 ${item.name}`}
          className="asset-library-thumbnail-button"
          onClick={() => openImagePreview(item.src, item.name, `${item.name}.png`)}
          type="button"
        >
          <img
            alt={item.name}
            className="asset-library-thumbnail"
            src={item.src}
            onContextMenu={(event) => {
              event.preventDefault();
              void downloadImageFile(item.src, `${item.name}.png`);
            }}
          />
        </button>
        <div className="asset-library-card-body">
          <div className="asset-library-card-head">
            <input
              aria-label={`资产名称 ${item.name}`}
              className="asset-library-name-input"
              value={editingName}
              onChange={(event) =>
                setEditingAssetNames((current) => ({
                  ...current,
                  [item.id]: event.target.value,
                }))
              }
              onBlur={() => renameAssetLibraryEntry(item.id, editingName)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  renameAssetLibraryEntry(item.id, editingName);
                }
                if (event.key === "Escape") {
                  setEditingAssetNames((current) => ({
                    ...current,
                    [item.id]: item.name,
                  }));
                }
              }}
            />
            <span>{item.type}</span>
          </div>
          <p>{item.saveDirectory || "未设置保存目录"}</p>
          <div className="asset-library-meta">
            <small>{item.model || "外部导入"}</small>
            <small>{item.ratio || "未设置比例"}</small>
            <small>{item.resolution || "未设置分辨率"}</small>
          </div>
          <div className="asset-library-actions">
            <button className="secondary-button" onClick={() => downloadImageFile(item.src, `${item.name}.png`)}>
              <Download size={16} />
              下载
            </button>
            <button className="danger-button" onClick={() => deleteAssetLibraryEntry(item.id)}>
              <Trash2 size={16} />
              删除 {item.name}
            </button>
          </div>
        </div>
      </article>
    );
  }

  function renderSelectControl(label: string, inputKey: string, options: string[], defaultValue: string) {
    return (
      <label>
        <span>{label}</span>
        <select
          aria-label={label}
          value={step.inputs[inputKey] ?? defaultValue}
          onChange={(event) => updateInput(inputKey, event.target.value)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderTemplateSelectControl(fieldKey: string) {
    const field = template.fields.find((item) => item.key === fieldKey);
    if (!field) return null;
    return renderSelectControl(field.label, field.key, field.options ?? [], field.defaultValue ?? "");
  }

  function renderFieldControl(field: TemplateField) {
    const value = step.inputs[field.key] ?? field.defaultValue ?? "";

    const canImportText =
      (project.currentStep === "outline-expansion" && field.key === "outline") ||
      (project.currentStep === "novel-to-script" && field.key === "sourceScene") ||
      (project.currentStep === "storyboard-15s" && field.key === "scriptText") ||
      (project.currentStep === "gpt-image2-storyboard" && field.key === "sourceText") ||
      (project.currentStep === "asset-extraction" && field.key === "sourceText");

    if (canImportText) {
      return (
        <div
          className="import-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void importTextFile(event.dataTransfer.files[0], field.key);
          }}
        >
          <textarea value={value} onChange={(event) => updateInput(field.key, event.target.value)} />
          <div className="import-tools">
            <label className="file-import-button">
              <FileUp size={16} />
              导入文档
              <input
                accept=".txt,.md,.csv,.json,.srt,.vtt,.log,.text"
                aria-label="导入文档"
                type="file"
                onChange={(event) => {
                  void importTextFile(event.target.files?.[0], field.key);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button className="secondary-button" type="button" onClick={() => updateInput(field.key, "")}>
              <Trash2 size={16} />
              清除
            </button>
            <span>支持 TXT / MD / CSV / JSON / SRT 等文本文件，也可以拖拽到这里。</span>
          </div>
        </div>
      );
    }

    if (field.control === "select") {
      return (
        <select
          aria-label={field.label}
          value={value}
          onChange={(event) => updateInput(field.key, event.target.value)}
        >
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (field.control === "number") {
      return (
        <input
          aria-label={field.label}
          max={field.max}
          min={field.min}
          type="number"
          value={value}
          onChange={(event) => updateInput(field.key, event.target.value)}
        />
      );
    }

    if (field.multiline || field.control === "textarea") {
      return (
        <textarea
          aria-label={field.label}
          value={value}
          onChange={(event) => updateInput(field.key, event.target.value)}
        />
      );
    }

    return <input aria-label={field.label} value={value} onChange={(event) => updateInput(field.key, event.target.value)} />;
  }

  function renderImageResultsPanel(results: ImageResult[], heading = "生图结果预览") {
    if (results.length === 0) return null;

    return (
      <div className="image-results" aria-label="生图结果预览">
        <div className="section-heading">
          <h3>{heading}</h3>
        </div>
        {upscaleStatus ? <div className="status-line">{upscaleStatus}</div> : null}
        {upscaleProgress ? (
          <div className="generation-progress" aria-label="高清放大进度" aria-live="polite">
            <div className="progress-header">
              <strong>高清放大进度</strong>
              <span>{upscaleProgress.label}</span>
              <b>{upscaleProgress.percent}%</b>
            </div>
            <div
              aria-label="高清放大进度"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={upscaleProgress.percent}
              className="progress-track"
              role="progressbar"
            >
              <div className="progress-fill" style={{ width: `${upscaleProgress.percent}%` }} />
            </div>
          </div>
        ) : null}
        <div className="image-result-grid">
          {results.map((image, index) => {
            const assetImageIndex = results.slice(0, index + 1).filter((item) => item.assetName === image.assetName).length;
            const imageAlt = `${image.assetName} 生图结果 ${assetImageIndex}`;
            const imageFilename = `${project.name || "novel-script"}-${template.name}-${image.assetName}-image-${assetImageIndex}.png`;
            return (
              <figure className="image-result-card" key={image.id}>
                <img
                  alt={imageAlt}
                  className="image-result-thumbnail"
                  draggable
                  src={image.src}
                  title="左键预览，右键下载，拖拽到字字动画图片位"
                  onClick={() => openImagePreview(image.src, imageAlt, imageFilename, image)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    void downloadImageFile(image.src, imageFilename);
                  }}
                  onDragStart={(event) => prepareImageDrag(event, image, imageFilename)}
                />
                <figcaption>
                  <span>
                    {image.assetName} 图片 {assetImageIndex}
                  </span>
                <button
                  className="secondary-button image-download-link"
                  onClick={() => downloadImageFile(image.src, imageFilename)}
                >
                  <Download size={16} />
                  下载图片 {assetImageIndex}
                </button>
                <button
                  className="secondary-button image-save-link"
                  onClick={() => saveImageResultToAssetLibrary(image)}
                >
                  <Save size={16} />
                  保存到资产库 {assetImageIndex}
                </button>
                <button
                  className="secondary-button image-upscale-link"
                  disabled={upscalingImageId === image.id}
                  onClick={() => void upscaleImageResult(image, "2K")}
                >
                  {upscalingImageId === image.id ? "放大中" : "2K放大"}
                </button>
                <button
                  className="secondary-button image-upscale-link"
                  disabled={upscalingImageId === image.id}
                  onClick={() => void upscaleImageResult(image, "4K")}
                >
                  {upscalingImageId === image.id ? "放大中" : "4K放大"}
                </button>
                <button
                  aria-label={`删除图片 ${index + 1}`}
                  className="danger-button image-delete-button"
                  onClick={() => deleteImageResult(image.id)}
                  >
                    <Trash2 size={16} />
                    删除
                  </button>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    );
  }

  if (isAssetLibraryStep) {
    return (
      <section className="workspace">
        <div className="workspace-header">
          <div>
            <h2>资产库</h2>
            <p>人物、场景、物品分目录管理。可导入图片、保存生图结果、删除和下载。</p>
          </div>
        </div>

        <div
          className="asset-library-tools import-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void importAssetLibraryFiles(event.dataTransfer.files);
          }}
        >
          <label className="wide-field">
            <span>搜索名称</span>
            <input
              aria-label="搜索名称"
              value={assetLibrarySearch}
              onChange={(event) => setAssetLibrarySearch(event.target.value)}
              placeholder="按名字筛选图片"
            />
          </label>
          <label>
            <span>导入类型</span>
            <select aria-label="导入类型" value={assetLibraryImportType} onChange={(event) => setAssetLibraryImportType(event.target.value as AssetLibraryType)}>
              <option value="人物">人物</option>
              <option value="场景">场景</option>
              <option value="物品">物品</option>
            </select>
          </label>
          <label>
            <span>资产名称</span>
            <input aria-label="资产名称" value={assetLibraryImportName} onChange={(event) => setAssetLibraryImportName(event.target.value)} />
          </label>
          <label>
            <span>保存目录</span>
            <input aria-label="保存目录" value={assetLibrarySaveDirectory} onChange={(event) => setAssetLibrarySaveDirectory(event.target.value)} placeholder="例如：F:/assets/人物" />
          </label>
          <label className="file-import-button">
            <FileUp size={16} />
            导入图片
            <input
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,image/tiff"
              aria-label="导入图片"
              multiple
              type="file"
              onChange={(event) => {
                void importAssetLibraryFiles(event.target.files ?? []);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        <div
          className="asset-library-columns"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void importAssetLibraryFiles(event.dataTransfer.files);
          }}
        >
          {(["人物", "场景", "物品"] as AssetLibraryType[]).map((type) => (
            <section className="asset-library-section" key={type}>
              <div className="section-heading">
                <h3>{type}</h3>
                <div className="heading-actions">
                  <button className="secondary-button" onClick={refreshAssetLibrary}>
                    <Save size={16} />
                    刷新
                  </button>
                  <button
                    className="secondary-button"
                    disabled={assetLibraryPageByType[type] <= 0}
                    onClick={() => setAssetLibraryPage(type, assetLibraryPageByType[type] - 1)}
                  >
                    上一页
                  </button>
                  <button
                    className="secondary-button"
                    disabled={assetLibraryPageByType[type] >= Math.max(0, Math.ceil(filteredAssetLibraryGroups[type].length / 4) - 1)}
                    onClick={() => setAssetLibraryPage(type, assetLibraryPageByType[type] + 1)}
                  >
                    下一页
                  </button>
                </div>
              </div>
              <div className="asset-library-page-meta">
                <span>每页 4 张</span>
                <span>
                  第 {Math.min(assetLibraryPageByType[type] + 1, Math.max(1, Math.ceil(filteredAssetLibraryGroups[type].length / 4)))} /{" "}
                  {Math.max(1, Math.ceil(filteredAssetLibraryGroups[type].length / 4))} 页
                </span>
              </div>
              <div className="asset-library-grid">
                {filteredAssetLibraryGroups[type].slice(assetLibraryPageByType[type] * 4, assetLibraryPageByType[type] * 4 + 4).length > 0 ? (
                  filteredAssetLibraryGroups[type]
                    .slice(assetLibraryPageByType[type] * 4, assetLibraryPageByType[type] * 4 + 4)
                    .map((item) => renderAssetLibraryItemCard(item))
                ) : (
                  <p className="muted">暂无{type}资产。</p>
                )}
              </div>
            </section>
          ))}
        </div>
      {previewImage ? (
          <div
            className="image-preview-backdrop"
            role="dialog"
            aria-label="图片高清预览"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setPreviewImage(null);
              }
            }}
          >
            <div className="image-preview-shell" onClick={(event) => event.stopPropagation()}>
              <div className="image-preview-toolbar">
                <strong>图片高清预览</strong>
                <div className="image-preview-actions">
                  <button className="secondary-button" type="button" onClick={zoomPreviewImage}>
                    预览放大
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setPreviewScale(1)}>
                    原始比例
                  </button>
                  <button className="secondary-button" type="button" onClick={() => downloadImageFile(previewImage.src, previewImage.filename)}>
                    <Download size={16} />
                    下载原图
                  </button>
                  <button className="ghost-button" type="button" onClick={() => setPreviewImage(null)}>
                    关闭
                  </button>
                </div>
              </div>
              <div className="image-preview-stage">
                <img
                  alt={`高清预览：${previewImage.alt}`}
                  src={previewImage.src}
                  style={{ transform: `scale(${previewScale})` }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="workspace">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">当前步骤</p>
          <h2>{template.name}</h2>
          <p>{template.description}</p>
        </div>
      </div>

      <div className="form-grid">
        {template.fields
          .filter(
            (field) =>
              project.currentStep !== "gpt-image2-storyboard" ||
              field.key === "sourceText",
          )
          .map((field) => (
          <label className={field.multiline ? "wide-field" : ""} key={field.key}>
            <span>
              {field.label}
              {field.required ? <b>必填</b> : null}
            </span>
            {renderFieldControl(field)}
          </label>
          ))}
      </div>

      {project.currentStep === "outline-expansion" ? (
        <div className="topic-recommendation-panel">
          <div className="section-heading">
            <h3>AI 随机推荐抖音爆款题材</h3>
            <div className="heading-actions">
              <button className="secondary-button" disabled={topicRecommendations.isLoading} onClick={() => void loadTopicRecommendations()}>
                <Bot size={16} />
                {topicRecommendations.isLoading ? "推荐中" : "刷新推荐"}
              </button>
            </div>
          </div>
          <p className="muted">
            {topicRecommendations.source === "ai" ? "当前为 AI 在线更新推荐。" : "当前为本地兜底推荐，点击刷新可尝试在线更新。"}
          </p>
          {topicRecommendations.message ? <div className="status-line">{topicRecommendations.message}</div> : null}
          <div className="topic-recommendation-grid">
            {topicRecommendations.items.map((item) => (
              <article className="topic-recommendation-card" key={item.title}>
                <div className="topic-recommendation-head">
                  <strong>{item.title}</strong>
                </div>
                <p>{item.summary}</p>
                <p className="topic-recommendation-outline">{item.outline}</p>
                <div className="asset-library-meta">
                  {item.tags.map((tag) => (
                    <small key={tag}>{tag}</small>
                  ))}
                </div>
                <div className="topic-recommendation-actions">
                  <button className="secondary-button" onClick={() => applyTopicRecommendation(item)}>
                    一键填入大纲
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="ai-model-summary" aria-label="当前 AI 模型">
        <span>当前文本模型：{aiSettings.model}</span>
        <span>Gemini 生图备用：{aiSettings.geminiImageModel || "未设置"}</span>
      </div>

      <div className="action-row">
        <button onClick={runAi} disabled={currentGeneration.isCalling}>
          <Bot size={16} />
          {currentGeneration.isCalling ? "生成中" : "调用 AI 生成"}
        </button>
        {project.currentStep === "storyboard-15s" ? (
          <button className="secondary-button" disabled={isSendingToZzdh || !step.draft.trim()} onClick={sendCurrentStoryboardToZzdh}>
            <Play size={16} />
            {isSendingToZzdh ? "发送中" : "发送分镜到字字动画"}
          </button>
        ) : null}
        <button className="secondary-button" onClick={() => onSaveVersion(step.draft)}>
          <Save size={16} />
          保存结果
        </button>
        <button className="ghost-button" onClick={() => copyText(step.draft, "结果")}>
          <Play size={16} />
          复制结果
        </button>
      </div>

      {visibleStatus ? <div className="status-line">{visibleStatus}</div> : null}

      {visibleProgress ? (
        <div className="generation-progress" aria-label="当前步骤生成进度" aria-live="polite">
          <div className="progress-header">
            <strong>生成进度</strong>
            <span>{visibleProgress.label}</span>
            <b>{visibleProgress.percent}%</b>
          </div>
          <div
            aria-label="生成进度"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={visibleProgress.percent}
            className="progress-track"
            role="progressbar"
          >
            <div className="progress-fill" style={{ width: `${visibleProgress.percent}%` }} />
          </div>
        </div>
      ) : null}

      {backgroundTasks.length > 0 ? (
        <div className="task-center" aria-label="后台任务中心">
          <div className="section-heading">
            <h3>后台任务中心</h3>
          </div>
          <div className="task-list">
            {backgroundTasks.map(({ stepId, task }) => (
              <article className="task-item" key={stepId}>
                <div>
                  <strong>{STEP_NAME_BY_ID[stepId]}</strong>
                  <span>{task.isCalling ? "运行中" : task.progress?.label === "生成失败" ? "失败" : "完成"}</span>
                </div>
                <p>{task.progress?.label ?? task.status}</p>
                <div
                  aria-label={`${STEP_NAME_BY_ID[stepId]}任务进度`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={task.progress?.percent ?? 0}
                  className="progress-track"
                  role="progressbar"
                >
                  <div className="progress-fill" style={{ width: `${task.progress?.percent ?? 0}%` }} />
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {project.currentStep === "prose-generation" && chapterOptions.length > 0 ? (
        <div className="chapter-picker">
          <label>
            <span>选择章节</span>
            <select
              aria-label="选择章节"
              value={step.inputs.chapterNumber ?? ""}
              onChange={(event) => selectChapterForProse(event.target.value)}
            >
              <option value="">从章节拆分结果选择</option>
              {chapterOptions.map((chapter) => (
                <option key={chapter.number} value={chapter.number}>
                  第{chapter.number}章 {chapter.title}
                </option>
              ))}
            </select>
          </label>
          <p>选择后会自动填入章节号、本章大纲，并继承章节拆分中的世界观与人物档案。</p>
        </div>
      ) : null}
      {project.currentStep === "prose-generation" && chapterOptions.length === 0 ? (
        <div className="chapter-picker">
          <p>还没有可选择章节。请先在第 2 步完成章节拆分，或把章节列表粘贴到第 2 步结果区。</p>
        </div>
      ) : null}

      <div className="section-heading">
        <h3>生成结果 / 外部粘贴区</h3>
        <div className="heading-actions">
          <button className="secondary-button" onClick={() => copyText(step.draft, "结果")}>
            <Clipboard size={16} />
            复制
          </button>
          {project.currentStep === "chapter-split" ? (
            <button className="secondary-button" onClick={continueToProseGeneration}>
              下一步：正文生成
            </button>
          ) : null}
          <button className="secondary-button" onClick={() => downloadTextFile(step.draft, "结果")}>
            <Download size={16} />
            导出 TXT
          </button>
          <button className="secondary-button" onClick={clearResults}>
            <Trash2 size={16} />
            一键清除
          </button>
        </div>
      </div>
      <textarea
        className="result-editor"
        placeholder="把 AI 输出粘贴到这里，或点击“调用 AI 生成”。确认后点击“保存结果”。"
        value={step.draft}
        onChange={(event) => updateDraft(event.target.value)}
      />

      {project.currentStep === "outline-expansion" ? (
        <div className="chapter-picker">
          <label>
            <span>优化章节</span>
            <select
              aria-label="优化章节"
              value={step.inputs.reviseChapter ?? "1"}
              onChange={(event) => updateInput("reviseChapter", event.target.value)}
            >
              {outlineRevisionChapterOptions.map((chapter) => (
                <option key={chapter.number} value={chapter.number}>
                  第{chapter.number}章
                </option>
              ))}
            </select>
          </label>
          <div className="heading-actions">
            <button className="secondary-button" disabled={currentGeneration.isCalling} onClick={runNovelContinuation}>
              续写下一章
            </button>
            <button className="secondary-button" disabled={currentGeneration.isCalling} onClick={runNovelChapterRevision}>
              优化选中章节
            </button>
          </div>
        </div>
      ) : null}

      {project.currentStep === "asset-extraction" ? (
        <div className="asset-generation-panel">
          <div className="section-heading">
            <h3>资产批量生图</h3>
            <div className="heading-actions">
              <button
                className="secondary-button"
                disabled={isGeneratingImage || extractedAssets.length === 0}
                onClick={runBatchImageGeneration}
              >
                <FileImage size={16} />
                {isGeneratingImage ? "批量生图中" : "生成全部"}
              </button>
              <button
                className="secondary-button"
                disabled={isSendingAssetsToZzdh || extractedAssets.length === 0}
                onClick={sendCurrentAssetsToZzdh}
              >
                <Bot size={16} />
                {isSendingAssetsToZzdh ? "发送中" : "发送到字字动画"}
              </button>
              <button
                aria-label="清除资产图片"
                className="secondary-button"
                disabled={assetImageResults.length === 0}
                onClick={clearAssetImageResults}
              >
                <Trash2 size={16} />
                一键清除
              </button>
            </div>
          </div>

          {extractedAssets.length > 0 ? (
            <div className="asset-generation-list">
              {extractedAssets.map((asset) => {
                const isAssetGenerating = Boolean(generatingAssets[asset.id]);
                return (
                  <article className="asset-generation-item" key={asset.id}>
                    <div className="asset-generation-editable">
                      <div className="asset-generation-title-row">
                        <strong>{asset.name}</strong>
                        <span>{asset.type}</span>
                      </div>
                      <textarea
                        aria-label={`${asset.name} ${asset.type}信息`}
                        value={editedAssetDescriptions[asset.id] ?? asset.description}
                        onChange={(event) => updateExtractedAssetDescription(asset, event.target.value)}
                      />
                    </div>
                    <div className="asset-generation-actions">
                      <button
                        aria-label={`生成 ${asset.name}`}
                        className="secondary-button"
                        disabled={isAssetGenerating}
                        onClick={() => runImageGeneration(asset)}
                      >
                        <FileImage size={16} />
                        {isAssetGenerating ? "生成中" : "生成"}
                      </button>
                      <button
                        aria-label={`删除 ${asset.name}`}
                        className="danger-button"
                        disabled={isAssetGenerating}
                        onClick={() => deleteExtractedAsset(asset)}
                      >
                        <Trash2 size={16} />
                        删除
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="muted">先调用 AI 提取资产，或把人物、场景、物品结果粘贴到上方结果区。</p>
          )}

          <div className="custom-image-panel">
            <div className="section-heading">
              <h3>自定义提示词出图</h3>
              <div className="heading-actions">
                <button className="secondary-button" onClick={clearCustomImagePrompts}>
                  <Trash2 size={16} />
                  清空提示词
                </button>
              </div>
            </div>
            <label className="wide-field">
              <span>前置提示词</span>
              <textarea
                className="custom-image-prefix"
                placeholder="可选。用于固定画风、镜头、比例、负面限制等，会自动拼到主提示词前面。"
                value={customImagePrefix}
                onChange={(event) => setCustomImagePrefix(event.target.value)}
              />
            </label>
            <label className="wide-field">
              <span>主提示词</span>
              <textarea
                className="custom-image-prompt"
                placeholder="直接输入你要送入生图模型的提示词，可生成单图或多图。"
                value={customImagePrompt}
                onChange={(event) => setCustomImagePrompt(event.target.value)}
              />
            </label>
            <div className="custom-image-actions">
              <label>
                <span>出图数量</span>
                <input
                  max={12}
                  min={1}
                  type="number"
                  value={customImageCount}
                  onChange={(event) => setCustomImageCount(event.target.value)}
                />
              </label>
              <button
                className="secondary-button"
                disabled={isGeneratingCustomImages}
                onClick={runCustomPromptImageGeneration}
              >
                <FileImage size={16} />
                {isGeneratingCustomImages ? "提示词出图中" : "按提示词出图"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {project.currentStep === "gpt-image2-storyboard" ? (
        <div aria-label="故事板出图区" className="asset-generation-panel">
          <div className="section-heading">
            <h3>故事板出图区</h3>
            <div className="heading-actions">
              <button className="secondary-button" disabled={isGeneratingImage || !step.draft.trim()} onClick={runStoryboardImageGeneration}>
                <FileImage size={16} />
                {isGeneratingImage ? "故事板出图中" : "生成故事板图片"}
              </button>
            </div>
          </div>
          <div className="storyboard-image-settings">
            {renderTemplateSelectControl("boardCount")}
            {renderTemplateSelectControl("imageRatio")}
            {renderTemplateSelectControl("visualStyle")}
            {renderTemplateSelectControl("panelLayout")}
            {renderSelectControl("生图模型", "imageModel", IMAGE_MODEL_OPTIONS, "gpt-image-2")}
            {renderSelectControl("分辨率", "imageResolution", IMAGE_RESOLUTION_OPTIONS, "1K")}
          </div>
          <p className="muted">会读取上方生成结果中的 GPT-image-2 出图提示词，并按当前画面布局、比例和影像风格生成故事板图片。</p>
          {storyboardImageStatus ? <div className="status-line">{storyboardImageStatus}</div> : null}
          {storyboardImageProgress ? (
            <div className="generation-progress" aria-label="故事板图片生成进度" aria-live="polite">
              <div className="progress-header">
                <strong>故事板图片进度</strong>
                <span>{storyboardImageProgress.label}</span>
                <b>{storyboardImageProgress.percent}%</b>
              </div>
              <div
                aria-label="故事板图片生成进度"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={storyboardImageProgress.percent}
                className="progress-track"
                role="progressbar"
              >
                <div className="progress-fill" style={{ width: `${storyboardImageProgress.percent}%` }} />
              </div>
            </div>
          ) : null}
          {renderImageResultsPanel(storyboardImageResults, "故事板生图结果预览")}
        </div>
      ) : null}

      {project.currentStep === "asset-extraction" ? renderImageResultsPanel(assetImageResults) : null}
      {previewImage ? (
        <div
          className="image-preview-backdrop"
          role="dialog"
          aria-label="图片高清预览"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewImage(null);
            }
          }}
        >
          <div className="image-preview-shell" onClick={(event) => event.stopPropagation()}>
            <div className="image-preview-toolbar">
              <strong>图片高清预览</strong>
              <div className="image-preview-actions">
                  <button className="secondary-button" type="button" onClick={zoomPreviewImage}>
                    预览放大
                  </button>
                  {previewImage.image ? (
                    <>
                      <button
                        className="secondary-button"
                        disabled={upscalingImageId === previewImage.image.id}
                        type="button"
                        onClick={() => void upscaleImageResult(previewImage.image!, "2K")}
                      >
                        2K高清
                      </button>
                      <button
                        className="secondary-button"
                        disabled={upscalingImageId === previewImage.image.id}
                        type="button"
                        onClick={() => void upscaleImageResult(previewImage.image!, "4K")}
                      >
                        4K高清
                      </button>
                    </>
                  ) : null}
                <button className="secondary-button" type="button" onClick={() => setPreviewScale(1)}>
                  原始比例
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => downloadImageFile(previewImage.src, previewImage.filename)}
                >
                  <Download size={16} />
                  下载原图
                </button>
                <button className="ghost-button" type="button" onClick={() => setPreviewImage(null)}>
                  关闭
                </button>
              </div>
            </div>
            <div className="image-preview-stage">
              <img
                alt={`高清预览：${previewImage.alt}`}
                src={previewImage.src}
                style={{ transform: `scale(${previewScale})` }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
