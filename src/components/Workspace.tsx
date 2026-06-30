import { Bot, Clipboard, Download, FileImage, FileUp, Play, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { callAi, callAiStream, callImageGeneration, type AiSettings } from "../domain/aiClient";
import {
  createAistarsLabVideoTask,
  fetchAistarsLabCredits,
  fetchAistarsLabVideoConfig,
  fetchAistarsLabVideoTask,
  getSeedanceModelsForChannel,
  normalizeSeedanceVideoCount,
  normalizeAistarsLabEndpoint,
  resolveSeedanceModelSelection,
  uploadAistarsLabMaterial,
  type AistarsLabVideoConfig,
  type AistarsLabVideoTask,
} from "../domain/aistarslabVideo";
import {
  addAssetLibraryItem,
  deleteAssetLibraryItem,
  loadAssetLibrary,
  updateAssetLibraryItem,
  type AssetLibraryItem,
  type AssetLibraryType,
} from "../domain/assetLibrary";
import type { Project } from "../domain/projects";
import { checkSeedanceSafety, type SeedanceSafetyReport } from "../domain/seedanceSafety";
import {
  buildPrompt,
  getTemplate,
  LOCAL_TREND_TOPIC_RECOMMENDATIONS,
  IMAGE_MODEL_OPTIONS,
  IMAGE_RESOLUTION_OPTIONS,
  NOVEL_STYLE_OPTIONS,
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
  previewSrc: string;
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

const MAX_SYNC_DRAG_DATA_URL_LENGTH = 2_000_000;
const MAX_INLINE_PREVIEW_DATA_URL_LENGTH = 1_000_000;

type TopicRecommendationState = {
  isLoading: boolean;
  source: "local" | "ai";
  items: TopicRecommendation[];
  message: string;
};

type SeedanceVideoResult = {
  id: string;
  taskId: string;
  url: string;
  prompt: string;
  model: string;
  channel: string;
  seconds: number;
  size: string;
  costCredits?: number;
};

type SeedanceVideoJob = {
  id: string;
  index: number;
  taskId?: string;
  status: "creating" | "queued" | "generating" | "completed" | "failed";
  label: string;
  percent: number;
  error?: string;
  result?: SeedanceVideoResult;
};

type SeedanceMaterialItem = {
  id: string;
  type: "image" | "video" | "audio";
  name: string;
  url: string;
};

type CustomImageReference = {
  id: string;
  name: string;
  src: string;
};

type CustomImageJob = {
  id: string;
  label: string;
  status: "queued" | "generating" | "completed" | "failed";
  progress: GenerationProgress;
  error?: string;
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
  "storyboard-15s": "15S 分镜脚本（只支持单集剧本拆分）",
  "gpt-image2-storyboard": "GPT-image2 六宫格故事板",
  "xiaotu-skill": "小兔skill",
  "seedance-video": "SEEDANCE2.0 视频生成",
  "custom-image": "自定义参考图出图",
  "script-polish": "剧本一键洗稿",
};

const NO_PREVIEWABLE_IMAGE_MESSAGE = "模型已响应，但没有返回可预览图片。请换生图模型或检查该模型是否支持图片输出。";
const SEEDANCE_VIDEO_MAX_POLL_ATTEMPTS = 402;
const DEFAULT_CUSTOM_IMAGE_PREFIX = [
  "人物结构：正脸特写+侧脸特写+脖子以下全身(脸裁出)+背面全身 + 四格同一人",
  "Hyperrealistic photographic 35mm film + NOT Caucasian + NOT 3D + 左下格不露脸",
  "【Layout】2x2 grid",
  "Top-left: FRONT FACE CLOSE-UP（正脸特写）",
  "Top-right: SIDE FACE CLOSE-UP（侧脸特写）",
  "Bottom-left: FULL BODY NECK DOWN, NO FACE（脖子以下全身，脸裁出画面）",
  "Bottom-right: FULL BODY BACK VIEW（背面全身）",
  "不要出现任何字幕、水印、logo、编号或多余文字",
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
  const [liveDraftByStep, setLiveDraftByStep] = useState<Partial<Record<TemplateId, string>>>({});
  const [liveInputsByStep, setLiveInputsByStep] = useState<Partial<Record<TemplateId, Record<string, string>>>>({});
  const [generationByStep, setGenerationByStep] = useState<Partial<Record<TemplateId, StepGenerationState>>>({});
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSendingToZzdh, setIsSendingToZzdh] = useState(false);
  const [isSendingAssetsToZzdh, setIsSendingAssetsToZzdh] = useState(false);
  const [generatingAssets, setGeneratingAssets] = useState<Record<string, boolean>>({});
  const [assetImageResults, setAssetImageResults] = useState<ImageResult[]>([]);
  const [storyboardImageResults, setStoryboardImageResults] = useState<ImageResult[]>([]);
  const [storyboardImageProgress, setStoryboardImageProgress] = useState<GenerationProgress | null>(null);
  const [storyboardImageStatus, setStoryboardImageStatus] = useState("");
  const [seedanceVideoConfig, setSeedanceVideoConfig] = useState<AistarsLabVideoConfig | null>(null);
  const [seedanceCredits, setSeedanceCredits] = useState<number | null>(null);
  const [seedanceConnectionStatus, setSeedanceConnectionStatus] = useState("");
  const [seedanceVideoStatus, setSeedanceVideoStatus] = useState("");
  const [seedanceVideoProgress, setSeedanceVideoProgress] = useState<GenerationProgress | null>(null);
  const [seedanceVideoTask, setSeedanceVideoTask] = useState<AistarsLabVideoTask | null>(null);
  const [seedanceVideoJobs, setSeedanceVideoJobs] = useState<SeedanceVideoJob[]>([]);
  const [seedanceVideoResults, setSeedanceVideoResults] = useState<SeedanceVideoResult[]>([]);
  const [seedanceMaterials, setSeedanceMaterials] = useState<SeedanceMaterialItem[]>([]);
  const [seedanceMentionQuery, setSeedanceMentionQuery] = useState<string | null>(null);
  const [isLoadingSeedanceConfig, setIsLoadingSeedanceConfig] = useState(false);
  const [isGeneratingSeedanceVideo, setIsGeneratingSeedanceVideo] = useState(false);
  const [isUploadingSeedanceMaterial, setIsUploadingSeedanceMaterial] = useState(false);
  const [seedanceSafetyReport, setSeedanceSafetyReport] = useState<SeedanceSafetyReport | null>(null);
  const [customImageReferences, setCustomImageReferences] = useState<CustomImageReference[]>([]);
  const [customImageResults, setCustomImageResults] = useState<ImageResult[]>([]);
  const [customImageJobs, setCustomImageJobs] = useState<CustomImageJob[]>([]);
  const [customImageStatus, setCustomImageStatus] = useState("");
  const [customImageProgress, setCustomImageProgress] = useState<GenerationProgress | null>(null);
  const [customImageMentionQuery, setCustomImageMentionQuery] = useState<string | null>(null);
  const customImagePromptRef = useRef<HTMLTextAreaElement | null>(null);
  const customImageJobIdRef = useRef(0);
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
  const previewObjectUrlRef = useRef<string | null>(null);
  const seedancePromptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const currentGeneration = generationByStep[project.currentStep] ?? {
    isCalling: false,
    status: "",
    progress: null,
  };
  const visibleProgress = project.currentStep === "asset-extraction" && progress ? progress : currentGeneration.progress;
  const visibleStatus = currentGeneration.status || status;
  const visibleDraft = liveDraftByStep[project.currentStep] ?? step.draft;
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
    setLiveDraftByStep((current) => {
      if (current[project.currentStep] === undefined || current[project.currentStep] !== step.draft) return current;
      const next = { ...current };
      delete next[project.currentStep];
      return next;
    });
  }, [project.currentStep, step.draft]);

  useEffect(() => {
    setLiveDraftByStep({});
    setLiveInputsByStep({});
  }, [project.id]);

  useEffect(() => {
    if (!previewImage) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeImagePreview();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewImage]);

  useEffect(() => () => revokePreviewObjectUrl(), []);

  useEffect(() => {
    if (project.currentStep !== "seedance-video" || !seedanceVideoConfig) return;
    const selection = resolveSeedanceModelSelection(seedanceVideoConfig, step.inputs.seedanceChannel, step.inputs.seedanceModel);
    if (
      selection.channel !== step.inputs.seedanceChannel ||
      selection.model !== step.inputs.seedanceModel ||
      selection.resolution !== step.inputs.seedanceResolution
    ) {
      onProjectChange({
        ...project,
        steps: {
          ...project.steps,
          [project.currentStep]: {
            ...step,
            inputs: {
              ...step.inputs,
              seedanceChannel: selection.channel,
              seedanceModel: selection.model,
              seedanceResolution: selection.resolution,
            },
          },
        },
      });
    }
  }, [onProjectChange, project, seedanceVideoConfig, step]);

  const prompt = useMemo(() => {
    try {
      return buildPrompt(template, { ...step.inputs, ...(liveInputsByStep[project.currentStep] ?? {}) });
    } catch (error) {
      return error instanceof Error ? error.message : "提示词生成失败";
    }
  }, [liveInputsByStep, project.currentStep, template, step.inputs]);

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
  const visibleSeedanceMaterials = useMemo(() => {
    if (project.currentStep !== "seedance-video") return [];
    const uploadedByUrl = new Map(seedanceMaterials.map((item) => [item.url, item]));
    const fromInputs: SeedanceMaterialItem[] = [
      ...parseReferenceUrls(step.inputs.seedanceImageUrls).map((url, index) => ({
        id: `input-image-${index}-${url}`,
        type: "image" as const,
        name: `参考图片 ${index + 1}`,
        url,
      })),
      ...parseReferenceUrls(step.inputs.seedanceVideoUrls).map((url, index) => ({
        id: `input-video-${index}-${url}`,
        type: "video" as const,
        name: `参考视频 ${index + 1}`,
        url,
      })),
      ...parseReferenceUrls(step.inputs.seedanceAudioUrls).map((url, index) => ({
        id: `input-audio-${index}-${url}`,
        type: "audio" as const,
        name: `参考音频 ${index + 1}`,
        url,
      })),
    ];
    return fromInputs.map((item) => {
      const uploaded = uploadedByUrl.get(item.url);
      return uploaded ? { ...uploaded, type: item.type, name: item.name, url: item.url } : item;
    });
  }, [project.currentStep, seedanceMaterials, step.inputs.seedanceAudioUrls, step.inputs.seedanceImageUrls, step.inputs.seedanceVideoUrls]);
  const seedanceAvailableModels = useMemo(
    () => getSeedanceModelsForChannel(seedanceVideoConfig, step.inputs.seedanceChannel),
    [seedanceVideoConfig, step.inputs.seedanceChannel],
  );
  const seedanceMentionOptions = useMemo(() => {
    if (seedanceMentionQuery === null) return [];
    const query = normalizeSeedanceMention(seedanceMentionQuery);
    return visibleSeedanceMaterials.filter((item) => {
      if (!query) return true;
      return normalizeSeedanceMention(item.name).includes(query);
    });
  }, [seedanceMentionQuery, visibleSeedanceMaterials]);
  const customImagePrompt = step.inputs.referencePrompt ?? "";
  const selectedCustomImageReferences = useMemo(() => {
    if (project.currentStep !== "custom-image") return [];
    const mentionMatches = Array.from(customImagePrompt.matchAll(/@参考图片\s*(\d+)/g))
      .map((match) => Number.parseInt(match[1], 10))
      .filter((index) => Number.isFinite(index) && index > 0);
    if (mentionMatches.length === 0) return customImageReferences;
    const selectedIndexes = new Set(mentionMatches.map((index) => index - 1));
    return customImageReferences.filter((_, index) => selectedIndexes.has(index));
  }, [customImagePrompt, customImageReferences, project.currentStep]);
  const customImageMentionOptions = useMemo(() => {
    if (customImageMentionQuery === null) return [];
    const query = normalizeSeedanceMention(customImageMentionQuery);
    return customImageReferences.filter((_, index) => {
      const name = `参考图片 ${index + 1}`;
      if (!query) return true;
      return normalizeSeedanceMention(name).includes(query);
    });
  }, [customImageMentionQuery, customImageReferences]);
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
    setLiveInputsByStep((current) => ({
      ...current,
      [project.currentStep]: {
        ...current[project.currentStep],
        [key]: value,
      },
    }));
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

  function updateSeedanceChannel(channelValue: string) {
    const selection = resolveSeedanceModelSelection(seedanceVideoConfig, channelValue);
    onProjectChange({
      ...project,
      steps: {
        ...project.steps,
        [project.currentStep]: {
          ...step,
          inputs: {
            ...step.inputs,
            seedanceChannel: channelValue,
            seedanceModel: selection.model,
            seedanceResolution: selection.resolution,
          },
        },
      },
    });
  }

  function updateSeedanceModel(modelValue: string) {
    const models = getSeedanceModelsForChannel(seedanceVideoConfig, step.inputs.seedanceChannel);
    const model = models.find((item) => item.model === modelValue);
    onProjectChange({
      ...project,
      steps: {
        ...project.steps,
        [project.currentStep]: {
          ...step,
          inputs: {
            ...step.inputs,
            seedanceModel: modelValue,
            seedanceResolution: model?.resolutions?.[0] ?? step.inputs.seedanceResolution ?? "720p",
          },
        },
      },
    });
  }

  function updateDraft(value: string) {
    setLiveDraftByStep((current) => ({ ...current, [project.currentStep]: value }));
    onProjectChange({
      ...project,
      steps: {
        ...project.steps,
        [project.currentStep]: { ...step, draft: value },
      },
    });
  }

  function writeDraftForStep(projectId: string, stepId: TemplateId, value: string) {
    setLiveDraftByStep((current) => ({ ...current, [stepId]: value }));
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
      const result = cleanAiTextOutput(await callAi(getTextAiSettings(), prompt));
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
      const result = await streamAiText(getTextAiSettings(), continuationPrompt, (partial) => {
        const nextDraft = [step.draft.trim(), partial].filter(Boolean).join("\n\n");
        writeDraftForStep(runProjectId, runStepId, nextDraft);
      });
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
        status: formatAiError(error, "AI 续写失败"),
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
      const result = await streamAiText(getTextAiSettings(), revisionPrompt, (partial) => {
        writeDraftForStep(runProjectId, runStepId, replaceNovelChapterBlock(step.draft, chapterNumber, partial));
      });
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
        status: formatAiError(error, "AI 优化失败"),
      });
    } finally {
      updateStepGeneration(runStepId, { isCalling: false });
    }
  }

  function clearResults() {
    updateDraft("");
    if (project.currentStep === "asset-extraction") setAssetImageResults([]);
    if (project.currentStep === "gpt-image2-storyboard") setStoryboardImageResults([]);
    if (project.currentStep === "custom-image") {
      setCustomImageResults([]);
      setCustomImageProgress(null);
      setCustomImageStatus("");
    }
    if (project.currentStep === "seedance-video") {
      setSeedanceVideoTask(null);
      setSeedanceVideoResults([]);
      setSeedanceVideoProgress(null);
      setSeedanceVideoStatus("");
    }
    setStatus("已清空当前结果区");
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
    setCustomImageResults((current) => current.filter((image) => image.id !== imageId));
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
    revokePreviewObjectUrl();
    setPreviewScale(1);
    if (!shouldUseObjectUrlPreview(src)) {
      setPreviewImage({ src, previewSrc: src, alt, filename, image });
      return;
    }

    setPreviewImage({ src, previewSrc: src, alt, filename, image });
  }

  function closeImagePreview() {
    revokePreviewObjectUrl();
    setPreviewImage(null);
    setPreviewScale(1);
  }

  function revokePreviewObjectUrl() {
    if (!previewObjectUrlRef.current) return;
    URL.revokeObjectURL?.(previewObjectUrlRef.current);
    previewObjectUrlRef.current = null;
  }

  function shouldUseObjectUrlPreview(src: string) {
    return /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(src) && src.length > MAX_INLINE_PREVIEW_DATA_URL_LENGTH;
  }

  function runSeedanceSafetyCheck() {
    const checkedText = step.draft.trim() || prompt;
    const report = checkSeedanceSafety(checkedText);
    setSeedanceSafetyReport(null);
    if (report.optimizedText.trim()) {
      updateDraft(report.optimizedText);
      setStatus(report.hasIssues ? "已检测并自动优化 SEEDAN2.0 风险内容" : report.summary);
    } else {
      setStatus(report.summary);
    }
  }

  function getSeedanceVideoSettings() {
    return {
      endpoint: normalizeAistarsLabEndpoint(step.inputs.seedanceEndpoint || "/api/aistarslab/openapi"),
      apiKey: step.inputs.seedanceApiKey?.trim() || aiSettings.apiKey,
    };
  }

  function parseReferenceUrls(value: string | undefined) {
    return String(value || "")
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeSeedanceMention(value: string) {
    return value.replace(/^@/, "").replace(/\s+/g, "").trim().toLowerCase();
  }

  function getActiveSeedanceMentionRange(value: string, cursorPosition: number) {
    const beforeCursor = value.slice(0, cursorPosition);
    const atIndex = beforeCursor.lastIndexOf("@");
    if (atIndex < 0) return null;
    const fragment = beforeCursor.slice(atIndex + 1);
    if (/[\n\r，,。；;、]/.test(fragment)) return null;
    return { start: atIndex, end: cursorPosition, query: fragment };
  }

  function refreshSeedanceMentionPicker(textarea: HTMLTextAreaElement) {
    const activeMention = getActiveSeedanceMentionRange(textarea.value, textarea.selectionStart);
    setSeedanceMentionQuery(activeMention?.query ?? null);
  }

  function getPromptSelectedMaterials(type: SeedanceMaterialItem["type"], sourceText: string) {
    const typedMaterials = visibleSeedanceMaterials.filter((item) => item.type === type);
    const mentionTokens = [
      ...Array.from(sourceText.matchAll(/@(参考图片|参考视频|参考音频)\s*(\d+)/g)).map((match) => normalizeSeedanceMention(`${match[1]}${match[2]}`)),
      ...Array.from(sourceText.matchAll(/@([^\n\r，,。；;、]+)/g)).map((match) => normalizeSeedanceMention(match[1])),
    ];
    if (mentionTokens.length === 0) return typedMaterials;

    return typedMaterials.filter((item) => {
      const normalizedName = normalizeSeedanceMention(item.name);
      const compactGenericName = normalizeSeedanceMention(
        `${item.type === "image" ? "参考图片" : item.type === "video" ? "参考视频" : "参考音频"} ${typedMaterials.indexOf(item) + 1}`,
      );
      return mentionTokens.some((token) => normalizedName.includes(token) || token.includes(normalizedName) || compactGenericName.includes(token) || token.includes(compactGenericName));
    });
  }

  async function loadSeedanceVideoConfig() {
    setIsLoadingSeedanceConfig(true);
    setSeedanceConnectionStatus("正在测试连接...");
    setSeedanceVideoStatus("正在测试 AIStartLab 连接...");
    try {
      const settings = getSeedanceVideoSettings();
      const [config, credits] = await Promise.all([
        fetchAistarsLabVideoConfig(settings),
        fetchAistarsLabCredits(settings).catch(() => null),
      ]);
      setSeedanceVideoConfig(config);
      setSeedanceCredits(credits);
      const defaultChannel = config.channels.find((channel) => channel.defaultOption) ?? config.channels[0];
      const defaultModel = defaultChannel?.models.find((model) => model.defaultOption) ?? defaultChannel?.models[0];
      if (defaultChannel && !step.inputs.seedanceChannel) updateInput("seedanceChannel", defaultChannel.channel);
      if (defaultModel && !step.inputs.seedanceModel) updateInput("seedanceModel", defaultModel.model);
      if (defaultModel?.resolutions?.[0] && !step.inputs.seedanceResolution) updateInput("seedanceResolution", defaultModel.resolutions[0]);
      const message = `连接成功，已读取 ${config.channels.length} 条线路${credits === null ? "" : `，当前积分 ${credits}`}`;
      setSeedanceConnectionStatus(message);
      setSeedanceVideoStatus(message);
    } catch (error) {
      const message = error instanceof Error ? `连接失败：${error.message}` : "连接失败";
      setSeedanceConnectionStatus(message);
      setSeedanceVideoStatus(message);
    } finally {
      setIsLoadingSeedanceConfig(false);
    }
  }

  async function uploadSeedanceMaterial(file: File | undefined) {
    if (!file) return;
    setIsUploadingSeedanceMaterial(true);
    setSeedanceVideoStatus(`正在上传素材：${file.name}`);
    try {
      const material = await uploadAistarsLabMaterial(getSeedanceVideoSettings(), file);
      const { materialType, targetKey } = getSeedanceMaterialTarget(file);
      const currentUrls = parseReferenceUrls(step.inputs[targetKey]);
      updateInput(targetKey, [...currentUrls, material.url].join("\n"));
      setSeedanceMaterials((current) => [
        {
          id: `material-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: materialType,
          name: file.name,
          url: material.url,
        },
        ...current,
      ]);
      setSeedanceVideoStatus(`素材上传完成，已加入参考列表：${file.name}`);
    } catch (error) {
      setSeedanceVideoStatus(error instanceof Error ? `素材上传失败：${error.message}` : "素材上传失败");
    } finally {
      setIsUploadingSeedanceMaterial(false);
    }
  }

  async function uploadSeedanceMaterials(files: FileList | File[]) {
    const fileItems = Array.from(files);
    if (fileItems.length <= 1) {
      await uploadSeedanceMaterial(fileItems[0]);
      return;
    }

    setIsUploadingSeedanceMaterial(true);
    const nextUrlsByKey = {
      seedanceImageUrls: parseReferenceUrls(step.inputs.seedanceImageUrls),
      seedanceVideoUrls: parseReferenceUrls(step.inputs.seedanceVideoUrls),
      seedanceAudioUrls: parseReferenceUrls(step.inputs.seedanceAudioUrls),
    };
    const uploadedItems: SeedanceMaterialItem[] = [];
    try {
      for (const file of fileItems) {
        setSeedanceVideoStatus(`正在上传素材：${file.name}`);
        const material = await uploadAistarsLabMaterial(getSeedanceVideoSettings(), file);
        const { materialType, targetKey } = getSeedanceMaterialTarget(file);
        nextUrlsByKey[targetKey].push(material.url);
        uploadedItems.push({
          id: `material-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: materialType,
          name: file.name,
          url: material.url,
        });
      }
      onProjectChange({
        ...project,
        steps: {
          ...project.steps,
          [project.currentStep]: {
            ...step,
            inputs: {
              ...step.inputs,
              seedanceImageUrls: nextUrlsByKey.seedanceImageUrls.join("\n"),
              seedanceVideoUrls: nextUrlsByKey.seedanceVideoUrls.join("\n"),
              seedanceAudioUrls: nextUrlsByKey.seedanceAudioUrls.join("\n"),
            },
          },
        },
      });
      setSeedanceMaterials((current) => [...uploadedItems, ...current]);
      setSeedanceVideoStatus(`素材上传完成，已加入参考列表：${fileItems.length} 个文件`);
    } catch (error) {
      setSeedanceVideoStatus(error instanceof Error ? `素材上传失败：${error.message}` : "素材上传失败");
    } finally {
      setIsUploadingSeedanceMaterial(false);
    }
  }

  function getSeedanceMaterialTarget(file: File): {
    materialType: SeedanceMaterialItem["type"];
    targetKey: "seedanceImageUrls" | "seedanceVideoUrls" | "seedanceAudioUrls";
  } {
    if (file.type.startsWith("video/")) {
      return { materialType: "video", targetKey: "seedanceVideoUrls" };
    }
    if (file.type.startsWith("audio/")) {
      return { materialType: "audio", targetKey: "seedanceAudioUrls" };
    }
    return { materialType: "image", targetKey: "seedanceImageUrls" };
  }

  function removeSeedanceMaterial(item: SeedanceMaterialItem) {
    const targetKey = item.type === "video" ? "seedanceVideoUrls" : item.type === "audio" ? "seedanceAudioUrls" : "seedanceImageUrls";
    const nextUrls = parseReferenceUrls(step.inputs[targetKey]).filter((url) => url !== item.url);
    updateInput(targetKey, nextUrls.join("\n"));
    setSeedanceMaterials((current) => current.filter((material) => material.id !== item.id));
    setSeedanceVideoStatus(`已移除参考素材：${item.name}`);
  }

  async function importCustomImageReferences(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setCustomImageStatus("请上传图片格式的参考素材。");
      return;
    }

    const availableSlots = Math.max(0, 14 - customImageReferences.length);
    if (availableSlots === 0) {
      setCustomImageStatus("参考图片最多14张，请先删除部分图片后再上传。");
      return;
    }

    const acceptedFiles = imageFiles.slice(0, availableSlots);
    const references = await Promise.all(
      acceptedFiles.map(async (file) => ({
        id: `custom-ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        src: await fileToDataUrl(file),
      })),
    );
    setCustomImageReferences((current) => [...current, ...references].slice(0, 14));
    setCustomImageStatus(`已导入 ${references.length} 张参考图片${imageFiles.length > acceptedFiles.length ? "，超出14张的部分已忽略" : ""}`);
  }

  function clearCustomImageWorkspace() {
    setCustomImageReferences([]);
    setCustomImageResults([]);
    setCustomImageJobs([]);
    setCustomImageProgress(null);
    setCustomImageStatus("已清空第9项参考图片和生图结果");
  }

  function removeCustomImageReference(referenceId: string) {
    setCustomImageReferences((current) => current.filter((item) => item.id !== referenceId));
    setCustomImageStatus("已移除参考图片");
  }

  function insertCustomImageReferenceMention(referenceIndex: number) {
    const mention = `@参考图片 ${referenceIndex + 1}`;
    const current = step.inputs.referencePrompt ?? "";
    const textarea = customImagePromptRef.current;
    const canInsertAtCursor = textarea && document.activeElement === textarea;
    const start = canInsertAtCursor ? textarea.selectionStart : current.length;
    const end = canInsertAtCursor ? textarea.selectionEnd : current.length;
    const prefix = current.slice(0, start);
    const suffix = current.slice(end);
    const needsLeadingSpace = prefix.length > 0 && !/[\s\n]$/.test(prefix);
    const needsTrailingSpace = suffix.length > 0 && !/^[\s\n]/.test(suffix);
    const insertedText = `${needsLeadingSpace ? " " : ""}${mention}${needsTrailingSpace ? " " : ""}`;
    const next = `${prefix}${insertedText}${suffix}`;
    updateInput("referencePrompt", next);
    window.setTimeout(() => {
      const nextPosition = prefix.length + insertedText.length;
      customImagePromptRef.current?.focus();
      customImagePromptRef.current?.setSelectionRange(nextPosition, nextPosition);
    }, 0);
    setCustomImageStatus(`已插入 ${mention}`);
  }

  function refreshCustomImageMentionPicker(textarea: HTMLTextAreaElement) {
    const activeMention = getActiveSeedanceMentionRange(textarea.value, textarea.selectionStart);
    setCustomImageMentionQuery(activeMention?.query ?? null);
  }

  function insertCustomImageReferenceMentionFromPicker(referenceIndex: number) {
    const mention = `@参考图片 ${referenceIndex + 1}`;
    const current = step.inputs.referencePrompt ?? "";
    const textarea = customImagePromptRef.current;
    const activeMention = textarea ? getActiveSeedanceMentionRange(current, textarea.selectionStart) : null;
    if (!activeMention) {
      insertCustomImageReferenceMention(referenceIndex);
      return;
    }

    const prefix = current.slice(0, activeMention.start);
    const suffix = current.slice(activeMention.end);
    const needsTrailingSpace = suffix.length > 0 && !/^[\s\n]/.test(suffix);
    const insertedText = `${mention}${needsTrailingSpace ? " " : ""}`;
    const next = `${prefix}${insertedText}${suffix}`;
    updateInput("referencePrompt", next);
    setCustomImageMentionQuery(null);
    window.setTimeout(() => {
      const nextPosition = prefix.length + insertedText.length;
      customImagePromptRef.current?.focus();
      customImagePromptRef.current?.setSelectionRange(nextPosition, nextPosition);
    }, 0);
    setCustomImageStatus(`已插入 ${mention}`);
  }

  function insertSeedanceMaterialMention(item: SeedanceMaterialItem, replaceActiveMention = false) {
    const mention = `@${item.name}`;
    const current = step.inputs.videoPromptSource ?? "";
    const textarea = seedancePromptTextareaRef.current;
    const activeMention = replaceActiveMention && textarea ? getActiveSeedanceMentionRange(current, textarea.selectionStart) : null;

    if (!activeMention && current.includes(mention)) {
      setSeedanceVideoStatus(`提示词里已包含参考素材：${mention}`);
      return;
    }

    const canInsertAtCursor = textarea && document.activeElement === textarea;
    const start = activeMention?.start ?? (canInsertAtCursor ? textarea.selectionStart : current.length);
    const end = activeMention?.end ?? (canInsertAtCursor ? textarea.selectionEnd : current.length);
    const prefix = current.slice(0, start);
    const suffix = current.slice(end);
    const needsLeadingBreak = prefix.length > 0 && !prefix.endsWith("\n") && !prefix.endsWith(" ");
    const needsTrailingBreak = suffix.length > 0 && !suffix.startsWith("\n") && !suffix.startsWith(" ");
    const insertedText = activeMention ? mention : `${needsLeadingBreak ? "\n" : ""}${mention}${needsTrailingBreak ? "\n" : ""}`;
    const next = `${prefix}${insertedText}${suffix}`;
    updateInput("videoPromptSource", next);
    setSeedanceMentionQuery(null);
    window.setTimeout(() => {
      const nextPosition = prefix.length + insertedText.length;
      seedancePromptTextareaRef.current?.focus();
      seedancePromptTextareaRef.current?.setSelectionRange(nextPosition, nextPosition);
    }, 0);
    setSeedanceVideoStatus(`已插入参考素材：${mention}`);
  }

  function updateSeedanceVideoJob(jobId: string, patch: Partial<SeedanceVideoJob>) {
    setSeedanceVideoJobs((current) => current.map((job) => (job.id === jobId ? { ...job, ...patch } : job)));
  }

  async function runSeedanceVideoGeneration() {
    const videoPrompt = (step.inputs.videoPromptSource || "").trim();
    if (!videoPrompt) {
      setSeedanceVideoStatus("请先填写或生成视频提示词。");
      return;
    }

    const selectedImageMaterials = getPromptSelectedMaterials("image", videoPrompt);
    const selectedVideoMaterials = getPromptSelectedMaterials("video", videoPrompt);
    const selectedAudioMaterials = getPromptSelectedMaterials("audio", videoPrompt);
    const imageUrls = selectedImageMaterials.map((item) => item.url);
    const videoUrls = selectedVideoMaterials.map((item) => item.url);
    const audioUrls = selectedAudioMaterials.map((item) => item.url);
    if (/@参考图片\s*\d+/.test(videoPrompt) && imageUrls.length === 0) {
      setSeedanceVideoStatus("提示词里写了 @参考图片，但没有匹配到对应参考图片。请先上传素材，或点击素材卡片的 @调用。");
      return;
    }
    const requestedModeType = step.inputs.modeType || "text2video";
    const modeType = imageUrls.length === 2 && requestedModeType === "frames2video"
      ? "frames2video"
      : imageUrls.length > 0 || videoUrls.length > 0 || audioUrls.length > 0
        ? "image2video"
        : "text2video";
    if (requestedModeType === "frames2video" && imageUrls.length !== 2) {
      setSeedanceVideoStatus("首尾帧模式需要正好 2 张参考图片 URL。");
      return;
    }

    const seconds = Number.parseInt(step.inputs.seconds || "5", 10) || 5;
    const selection = resolveSeedanceModelSelection(seedanceVideoConfig, step.inputs.seedanceChannel, step.inputs.seedanceModel);
    const channel = selection.channel;
    const model = selection.model;
    const size = step.inputs.size || "9:16";
    const resolution = selection.resolution;
    const videoCount = normalizeSeedanceVideoCount(step.inputs.seedanceVideoCount, 6);
    const settings = getSeedanceVideoSettings();

    setIsGeneratingSeedanceVideo(true);
    setSeedanceVideoTask(null);
    setSeedanceVideoProgress({ label: `创建 ${videoCount} 条视频任务`, percent: 5 });
    setSeedanceVideoStatus(`正在并发创建 ${videoCount} 条 SEEDANCE2.0 视频任务，已调用参考图片 ${imageUrls.length} 张、参考视频 ${videoUrls.length} 条、参考音频 ${audioUrls.length} 条。`);
    const jobs: SeedanceVideoJob[] = Array.from({ length: videoCount }, (_, index) => ({
      id: `seedance-job-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      index: index + 1,
      status: "creating",
      label: "创建任务",
      percent: 5,
    }));
    setSeedanceVideoJobs((current) => [...jobs, ...current]);

    try {
      await Promise.allSettled(
        jobs.map(async (job) => {
          try {
            const created = await createAistarsLabVideoTask(settings, {
              channel,
              model,
              resolution,
              prompt: videoPrompt,
              seconds,
              size,
              modeType,
              images: imageUrls,
              videos: videoUrls,
              audios: audioUrls,
            });

            updateSeedanceVideoJob(job.id, {
              taskId: created.taskId,
              status: "queued",
              label: "任务排队中",
              percent: 15,
            });
            setSeedanceVideoStatus(`已创建任务 ${job.index}/${videoCount}：${created.taskId}`);

            const startedAt = Date.now();
            let latestTask: AistarsLabVideoTask = {
              taskId: created.taskId,
              status: created.status,
              progress: 0,
              costCredits: created.costCredits,
            };

            for (let attempt = 0; attempt < SEEDANCE_VIDEO_MAX_POLL_ATTEMPTS; attempt += 1) {
              await wait(attempt < 4 ? 1500 : 3000);
              latestTask = await fetchAistarsLabVideoTask(settings, created.taskId);
              setSeedanceVideoTask(latestTask);
              const fallbackPercent = Math.min(92, 15 + Math.floor((Date.now() - startedAt) / 1000));
              const reportedPercent = typeof latestTask.progress === "number" ? latestTask.progress : fallbackPercent;
              const percent = latestTask.status === 3 ? 100 : Math.min(98, Math.max(15, reportedPercent));
              const label = latestTask.status === 1 ? "任务排队中" : latestTask.status === 2 ? "视频生成中" : latestTask.status === 3 ? "生成完成" : "生成失败";
              updateSeedanceVideoJob(job.id, {
                taskId: latestTask.taskId,
                status: latestTask.status === 1 ? "queued" : latestTask.status === 2 ? "generating" : latestTask.status === 3 ? "completed" : "failed",
                label,
                percent,
              });

              if (latestTask.status === 3) {
                if (!latestTask.outputUrl) throw new Error("任务完成但没有返回视频地址");
                const result: SeedanceVideoResult = {
                  id: `seedance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  taskId: latestTask.taskId,
                  url: latestTask.outputUrl,
                  prompt: videoPrompt,
                  model,
                  channel,
                  seconds,
                  size,
                  costCredits: latestTask.costCredits ?? created.costCredits,
                };
                updateSeedanceVideoJob(job.id, { result, status: "completed", label: "生成完成", percent: 100 });
                setSeedanceVideoResults((current) => [result, ...current]);
                return;
              }

              if (latestTask.status === 4) {
                throw new Error(latestTask.errorMessage || latestTask.errorCode || "视频任务生成失败");
              }
            }

            throw new Error("等待超时：平台可能仍在后台生成，请稍后到平台后台查看，或重新提交同一提示词。");
          } catch (error) {
            const message = error instanceof Error ? error.message : "视频生成失败";
            updateSeedanceVideoJob(job.id, {
              status: "failed",
              label: message.startsWith("等待超时") ? "等待超时" : "生成失败",
              percent: 100,
              error: message,
            });
          }
        }),
      );

      setSeedanceVideoProgress({ label: "批量任务已结束", percent: 100 });
      setSeedanceVideoStatus("批量视频生成已结束，请查看每条任务的完成状态或失败原因。");
    } catch (error) {
      setSeedanceVideoProgress({ label: "生成失败", percent: 100 });
      setSeedanceVideoStatus(error instanceof Error ? `视频生成失败：${error.message}` : "视频生成失败");
    } finally {
      setIsGeneratingSeedanceVideo(false);
    }
  }

  function prepareImageDrag(event: React.DragEvent<HTMLImageElement>, image: ImageResult, filename: string) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(
      "application/x-xiaotu-asset-image",
      JSON.stringify({
        id: image.id,
        assetName: image.assetName,
        assetType: image.assetType,
        filename,
      }),
    );
    if (/^https?:\/\//i.test(image.src)) {
      event.dataTransfer.setData("text/uri-list", image.src);
      event.dataTransfer.setData("text/plain", image.src);
      event.dataTransfer.setData("DownloadURL", `image/png:${filename}:${image.src}`);
      return;
    }

    const fallbackText = `图片：${filename}`;
    event.dataTransfer.setData("text/plain", fallbackText);
    event.dataTransfer.setData("DownloadURL", `image/png:${filename}:${filename}`);
  }

  function zoomPreviewImage() {
    setPreviewScale((current) => Math.min(4, current + 1));
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

  function getAssetImageResolutionOptions(imageModel: string) {
    return IMAGE_RESOLUTION_OPTIONS;
  }

  function normalizeImageModelSelection(imageModel: string | undefined, defaultModel = "gpt-image-2") {
    const selected = imageModel?.trim() || defaultModel;
    return IMAGE_MODEL_OPTIONS.includes(selected) ? selected : defaultModel;
  }

  function normalizeAssetImageResolution(imageModel: string, imageResolution: string) {
    const options = getAssetImageResolutionOptions(imageModel);
    return options.includes(imageResolution) ? imageResolution : options[0];
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
    options?: { referenceImages?: string[] },
  ) {
    const retryDelays = [3500, 9000];
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        return await callImageGeneration(settings, prompt, model, ratio, resolution, options);
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
    const currentInputs = { ...step.inputs, ...(liveInputsByStep[project.currentStep] ?? {}) };
    return template.fields
      .filter((field) => field.required)
      .filter((field) => !String(currentInputs[field.key] ?? field.defaultValue ?? "").trim())
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

  function getExpectedXiaotuSegmentCount(inputs: Record<string, string>) {
    const sourceText = String(inputs.sourceText ?? "");
    const segmentSeconds = Math.max(Number.parseInt(String(inputs.segmentSeconds ?? "15"), 10) || 15, 1);
    const capacityCount = estimateXiaotuSegmentCountByContent(sourceText, segmentSeconds);

    return capacityCount > 1 ? capacityCount : null;
  }

  function estimateXiaotuSegmentCountByContent(sourceText: string, segmentSeconds: number) {
    const compactText = sourceText
      .replace(/<[^>]+>/g, "")
      .replace(/(?:^|\n)\s*第\s*[一二三四五六七八九十百千万\d]+\s*[集场幕段章]\s*[:：、.．-]?/g, "")
      .replace(/\s+/g, "");
    if (!compactText) return 0;
    const charsPer15Seconds = 150;
    const charsPerSegment = Math.max(Math.round((segmentSeconds / 15) * charsPer15Seconds), 60);
    return Math.ceil(compactText.length / charsPerSegment);
  }

  function parseChineseOrArabicNumber(value: string) {
    const normalized = value.trim();
    if (/^\d+$/.test(normalized)) return Number.parseInt(normalized, 10);
    const digits: Record<string, number> = {
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
    if (normalized === "十") return 10;
    const tenIndex = normalized.indexOf("十");
    if (tenIndex >= 0) {
      const left = normalized.slice(0, tenIndex);
      const right = normalized.slice(tenIndex + 1);
      const tens = left ? digits[left] ?? 0 : 1;
      const ones = right ? digits[right] ?? 0 : 0;
      return tens * 10 + ones;
    }
    return digits[normalized] ?? Number.NaN;
  }

  function getGeneratedXiaotuSegmentCount(draft: string) {
    const numbers = Array.from(draft.matchAll(/(?:^|\n)\s*【\s*段落\s*([一二三四五六七八九十百千万\d]+)/g))
      .map((match) => parseChineseOrArabicNumber(match[1]))
      .filter((number) => Number.isFinite(number) && number > 0);
    if (numbers.length > 0) return Math.max(...numbers);
    const sectionCount = (draft.match(/(?:^|\n)\s*【基础设定】/g) ?? []).length;
    return sectionCount > 0 ? sectionCount : 0;
  }

  function cleanXiaotuSkillOutput(value: string) {
    const cleaned = cleanAiTextOutput(value);
    const firstSegmentIndex = cleaned.search(/(?:^|\n)\s*【\s*段落\s*[一二三四五六七八九十百千万\d]+/);
    if (firstSegmentIndex >= 0) return cleanXiaotuVisibleBlocks(cleaned.slice(firstSegmentIndex)).trim();
    return "";
  }

  function cleanXiaotuVisibleBlocks(value: string) {
    return removeXiaotuStandaloneDialogueLines(removeXiaotuInternalBlocks(value)).trim();
  }

  function removeXiaotuInternalBlocks(value: string) {
    return value
      .replace(
        /(?:^|\n)\s*【\s*(?:角色音色锁定表|空间坐标与连续性)\s*】[\s\S]*?(?=\n\s*【\s*(?:段落\s*[一二三四五六七八九十百千万\d]+[^】]*|基础设定|氛围与画质|声音|画面内容)\s*】|$)/g,
        "\n",
      )
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function removeXiaotuStandaloneDialogueLines(value: string) {
    return value
      .split("\n")
      .filter((line) => !/^\s*(?:[-*]\s*)?对白[:：]/.test(line))
      .map((line) =>
        line.replace(/对白[:：]\s*([^：:\n]+?)（([^）\n]+)）[:：]\s*([^。！？!?；;\n]+[。！？!?；;]?)/g, (_match, speaker, tone, words) => {
          const trimmedWords = String(words).trim().replace(/^["“]|["”]$/g, "");
          return `${String(speaker).trim()}（${String(tone).trim()}）说：“${trimmedWords}”`;
        }),
      )
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  async function ensureCompleteXiaotuSkill(
    initialResult: string,
    originalPrompt: string,
    inputs: Record<string, string>,
    stepId: TemplateId,
    onCombinedResult?: (combinedResult: string) => void,
  ) {
    const expectedCount = getExpectedXiaotuSegmentCount(inputs);
    if (!expectedCount || expectedCount <= 1) return initialResult;

    let combinedResult = initialResult.trim();
    const continuationBatchSize = 1;
    const maxContinuationAttempts = Math.min(expectedCount + 4, 120);
    let emptyContinuationCount = 0;
    for (let attempt = 0; attempt < maxContinuationAttempts; attempt += 1) {
      const generatedCount = getGeneratedXiaotuSegmentCount(combinedResult);
      if (generatedCount >= expectedCount) break;
      const nextSegment = generatedCount + 1;
      const batchEndSegment = Math.min(expectedCount, nextSegment + continuationBatchSize - 1);

      updateStepGeneration(stepId, {
        progress: { label: `补齐段落${nextSegment}-${batchEndSegment}`, percent: Math.min(72 + attempt * 4, 88) },
        status: `检测到小兔skill只生成 ${generatedCount || 1}/${expectedCount} 段，正在继续补齐...`,
      });

      const continuationPrompt = [
        "继续补齐小兔skill视频提示词。",
        `原文预计需要输出 ${expectedCount} 个15秒段落，当前只生成到第${generatedCount || 1}段。`,
        `本次只输出【段落${nextSegment}】到【段落${batchEndSegment}】，不要一次输出更多段落。`,
        "",
        "这是原始生成要求：",
        originalPrompt,
        "",
        "当前已经生成：",
        combinedResult,
        "",
        `请从【段落${nextSegment}】继续输出到【段落${batchEndSegment}】。`,
        "必须继续覆盖原文对应剧情，不要重复已经生成的段落，不要总结，不要解释，不要说受长度限制，不要说可以继续分批。",
        "保持每段完整包含【基础设定】【角色音色锁定表】【氛围与画质】【空间坐标与连续性】【画面内容】。",
        "段落标题继续使用【段落N｜时长秒｜模式】格式，时间轴每段都从0s重新开始。",
      ].join("\n");
      const baseResult = combinedResult;
      const continuationResult = await streamAiText(getTextAiSettings(), continuationPrompt, (partial) => {
        const cleanedPartial = cleanXiaotuSkillOutput(partial);
        if (cleanedPartial.trim()) {
          onCombinedResult?.([baseResult, cleanedPartial].filter(Boolean).join("\n\n"));
        }
      });
      const cleanedContinuation = cleanXiaotuSkillOutput(continuationResult);
      if (!cleanedContinuation.trim()) {
        emptyContinuationCount += 1;
        if (emptyContinuationCount >= 2) break;
        continue;
      }
      emptyContinuationCount = 0;
      combinedResult = [combinedResult, cleanedContinuation].filter(Boolean).join("\n\n");
      onCombinedResult?.(combinedResult);
    }

    const generatedCount = getGeneratedXiaotuSegmentCount(combinedResult);
    if (generatedCount < expectedCount) {
      combinedResult = [
        combinedResult,
        "",
        `【系统提醒】当前小兔skill结果只检测到 ${generatedCount}/${expectedCount} 段，请再次点击“调用 AI 生成”或缩短单次输入后重试。`,
      ].join("\n");
      onCombinedResult?.(combinedResult);
    }

    return combinedResult;
  }

  async function ensureCompleteChapterSplit(
    initialResult: string,
    originalPrompt: string,
    inputs: Record<string, string>,
    stepId: TemplateId,
    onCombinedResult?: (combinedResult: string) => void,
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
      const baseResult = combinedResult;
      const continuationResult = await streamAiText(getTextAiSettings(), continuationPrompt, (partial) => {
        onCombinedResult?.([baseResult, partial].filter(Boolean).join("\n\n"));
      });
      combinedResult = [combinedResult, continuationResult].filter(Boolean).join("\n\n");
      onCombinedResult?.(combinedResult);
    }

    const remainingRange = getMissingChapterRange(combinedResult, expectedCount);
    if (remainingRange) {
      combinedResult = [
        combinedResult,
        "",
        `【系统提醒】当前章节拆分仍缺少第${remainingRange.start}章到第${remainingRange.end}章，请再次点击“调用 AI 生成”或降低总章数后重试。`,
      ].join("\n");
      onCombinedResult?.(combinedResult);
    }

    return combinedResult;
  }

  function getTextAiSettings(): AiSettings {
    const normalizedEndpoint = aiSettings.endpoint.trim().replace(/\/+$/, "");
    if (normalizedEndpoint !== "https://timeai.chat/v1") return aiSettings;
    return { ...aiSettings, endpoint: "/api/timeai/v1" };
  }

  function getTextAiSettingsForStep(_stepId: TemplateId): AiSettings {
    return getTextAiSettings();
  }

  async function streamAiText(settings: AiSettings, runPrompt: string, onPartial?: (partial: string) => void) {
    let streamedDraft = "";
    try {
      const streamedResult = await callAiStream(settings, runPrompt, (chunk) => {
        streamedDraft += chunk;
        const cleanedPartial = cleanAiTextOutput(streamedDraft);
        if (cleanedPartial.trim()) {
          onPartial?.(cleanedPartial);
        }
      });
      const result = cleanAiTextOutput(streamedResult || streamedDraft);
      if (result.trim() && result !== cleanAiTextOutput(streamedDraft)) {
        onPartial?.(result);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (streamedDraft.trim()) {
        return cleanAiTextOutput(streamedDraft);
      }
      if (!/AI 流式响应超时|AI 返回格式不正确/.test(message)) {
        throw error;
      }
      const fallbackResult = cleanAiTextOutput(await callAi(settings, runPrompt));
      if (fallbackResult.trim()) {
        onPartial?.(fallbackResult);
      }
      return fallbackResult;
    }
  }

  function formatAiError(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : fallback;
    if (/HTTP 524/.test(message)) {
      return "AI 调用超时：HTTP 524。请缩短输入内容或切换响应更快的模型/接口。";
    }
    if (/网络请求未完成|Failed to fetch|fetch failed|load failed/i.test(message)) {
      return "AI 调用失败：站内代理未返回结果。请刷新页面后重试；本地版请重启 npm run dev，网页端请等待部署完成。";
    }
    return message;
  }

  async function runAi() {
    const runProjectId = project.id;
    const runStepId = project.currentStep;
    const runInputs = { ...project.steps[runStepId].inputs, ...(liveInputsByStep[runStepId] ?? {}) };
    const missingFields = getMissingRequiredFields();
    if (missingFields.length > 0) {
      setStatus(`请先填写：${missingFields.join("、")}`);
      return;
    }
    let runPrompt = "";
    try {
      runPrompt = buildPrompt(getTemplate(runStepId), runInputs);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "提示词生成失败");
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
      const textAiSettings = getTextAiSettingsForStep(runStepId);
      const initialResult = await streamAiText(textAiSettings, runPrompt, (partial) => {
        const visiblePartial = runStepId === "xiaotu-skill" ? cleanXiaotuSkillOutput(partial) : partial;
        if (visiblePartial.trim()) {
          writeDraftForStep(runProjectId, runStepId, visiblePartial);
        }
      });
      const cleanedInitialResult = runStepId === "xiaotu-skill" ? cleanXiaotuSkillOutput(initialResult) : initialResult;
      stopTextProgressTimer(runStepId);
      if (!cleanedInitialResult.trim()) {
        throw new Error("AI 返回内容为空，请检查模型是否只返回了思考过程或更换模型重试。");
      }
      const result =
        runStepId === "chapter-split"
          ? await ensureCompleteChapterSplit(cleanedInitialResult, runPrompt, runInputs, runStepId, (partial) => {
              writeDraftForStep(runProjectId, runStepId, partial);
            })
          : runStepId === "xiaotu-skill"
            ? await ensureCompleteXiaotuSkill(cleanedInitialResult, runPrompt, runInputs, runStepId, (partial) => {
                writeDraftForStep(runProjectId, runStepId, partial);
              })
          : cleanedInitialResult;
      if (!result.trim()) {
        throw new Error("AI 返回内容为空，请检查模型是否只返回了思考过程或更换模型重试。");
      }
      updateStepGeneration(runStepId, { progress: { label: "写入草稿", percent: 90 } });
      if (result !== cleanedInitialResult) {
        writeDraftForStep(runProjectId, runStepId, result);
      } else {
        writeDraftForStep(runProjectId, runStepId, cleanedInitialResult);
      }
      updateStepGeneration(runStepId, {
        progress: { label: "生成完成", percent: 100 },
        status: "AI 结果已放入草稿区",
      });
    } catch (error) {
      stopTextProgressTimer(runStepId);
      updateStepGeneration(runStepId, {
        progress: { label: "生成失败", percent: 100 },
        status: formatAiError(error, "AI 调用失败"),
      });
    } finally {
      updateStepGeneration(runStepId, { isCalling: false });
    }
  }

  async function sendCurrentStoryboardToZzdh() {
    const canSendToZzdh = project.currentStep === "storyboard-15s" || project.currentStep === "xiaotu-skill";
    if (!canSendToZzdh) return;
    const storyboardDraft = liveDraftByStep[project.currentStep] ?? step.draft;
    if (!storyboardDraft.trim()) {
      setStatus(
        project.currentStep === "xiaotu-skill"
          ? "请先生成或粘贴小兔skill结果，再发送到字字动画。"
          : "请先生成或粘贴15S分镜脚本，再发送到字字动画。",
      );
      return;
    }

    setIsSendingToZzdh(true);
    setStatus("正在发送到字字动画...");
    try {
      await sendStoryboardToZzdh(project.name, storyboardDraft);
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
      const imageModel = normalizeImageModelSelection(step.inputs.imageModel);
      const imageRatio = step.inputs.imageRatio ?? "16:9";
      const imageResolution = normalizeAssetImageResolution(imageModel, step.inputs.imageResolution ?? "1K");
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
      const imageModel = normalizeImageModelSelection(step.inputs.imageModel);
      const imageRatio = step.inputs.imageRatio ?? "16:9";
      const imageResolution = normalizeAssetImageResolution(imageModel, step.inputs.imageResolution ?? "1K");
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
      const imageModel = normalizeImageModelSelection(step.inputs.imageModel);
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

  function buildCustomImagePrompt() {
    const referenceLines = selectedCustomImageReferences.map((item) => {
      const index = customImageReferences.findIndex((reference) => reference.id === item.id);
      return `@参考图片 ${index + 1}：${item.name}（已在第9项本地参考区上传；不要把图片数据写进提示词）`;
    });
    return [
      referenceLines.length > 0
        ? `# 参考图片\n${referenceLines.join("\n\n")}`
        : "# 参考图片\n未上传参考图片，本次按纯文本提示词生成。",
      "# 用户主提示词",
      step.inputs.referencePrompt ?? "",
      "# 生成要求",
      "如果用户提示词包含 @参考图片 N，请以对应图片为主体、风格、构图或局部修改参考；不要把已引用主体替换成无关内容。",
      "不要字幕、水印、logo、编号、多余 UI 文字、乱码文字。",
    ].join("\n\n");
  }

  function updateCustomImageJob(jobId: string, patch: Partial<CustomImageJob>) {
    setCustomImageJobs((current) => current.map((job) => (job.id === jobId ? { ...job, ...patch } : job)));
  }

  function runCustomImageGeneration() {
    const cleanPrompt = (step.inputs.referencePrompt ?? "").trim();
    if (!cleanPrompt) {
      setCustomImageStatus("请先填写主提示词。");
      return;
    }

    const imageModel = normalizeImageModelSelection(step.inputs.imageModel);
    const imageRatio = step.inputs.imageRatio ?? "16:9";
    const imageResolution = normalizeAssetImageResolution(imageModel, step.inputs.imageResolution ?? "1K");
    const imageCount = Math.min(12, Math.max(1, Number.parseInt(step.inputs.imageCount ?? "1", 10) || 1));
    const imagePrompt = buildCustomImagePrompt();
    const imageCall = resolveImageCallSettings(imageModel);
    const generatedImages: ImageResult[] = [];
    const failedMessages: string[] = [];
    const jobId = `custom-image-job-${++customImageJobIdRef.current}`;
    const selectedReferenceImages = selectedCustomImageReferences.map((item) => item.src);

    setCustomImageJobs((current) => [
      ...current,
      {
        id: jobId,
        label: `任务 ${current.length + 1}`,
        status: "queued",
        progress: { label: "排队中", percent: 4 },
      },
    ]);
    setCustomImageStatus(`已提交任务 ${customImageJobIdRef.current}，可继续生成新的任务。`);
    setCustomImageProgress({ label: "任务已提交", percent: 4 });

    void (async () => {
      setCustomImageResults((current) => current);
      updateCustomImageJob(jobId, { status: "generating", progress: { label: "准备第9项生图参数", percent: 8 } });
      try {
        for (let index = 0; index < imageCount; index += 1) {
          try {
            updateCustomImageJob(jobId, {
              status: "generating",
              progress: {
                label: `生成 ${index + 1}/${imageCount}`,
                percent: Math.min(88, 18 + Math.floor((index / imageCount) * 68)),
              },
            });
            setCustomImageStatus(`第9项任务 ${customImageJobIdRef.current} 正在生成第 ${index + 1}/${imageCount} 张图片`);
            const result = await callImageGenerationWithRetry(
              imageCall.settings,
              imagePrompt,
              imageCall.model,
              imageRatio,
              imageResolution,
              (attempt, delaySeconds) => {
                setCustomImageStatus(`第9项任务 ${customImageJobIdRef.current} 图片 ${index + 1}/${imageCount} 触发限流，${delaySeconds}秒后自动重试第${attempt}次...`);
                updateCustomImageJob(jobId, {
                  status: "generating",
                  progress: { label: `限流等待重试 ${attempt}`, percent: 42 },
                });
              },
              { referenceImages: selectedReferenceImages },
            );
            const images = parseImageResults(result, `自定义参考图 ${jobId}`, {
              assetType: "物品",
              prompt: imagePrompt,
              model: imageCall.model,
              ratio: imageRatio,
              resolution: imageResolution,
            });
            generatedImages.push(...images);
            setCustomImageResults((current) => [...current, ...images]);
          } catch (error) {
            failedMessages.push(error instanceof Error ? `第${index + 1}张：${error.message}` : `第${index + 1}张：生图失败`);
          }
        }

        updateCustomImageJob(jobId, {
          status: failedMessages.length > 0 && generatedImages.length === 0 ? "failed" : "completed",
          progress: { label: "任务完成", percent: 100 },
          error: failedMessages.length > 0 ? failedMessages.join("；") : undefined,
        });
        setCustomImageProgress({ label: "第9项生图完成", percent: 100 });
        if (failedMessages.length > 0 && generatedImages.length > 0) {
          setCustomImageStatus(`任务 ${jobId} 已生成 ${generatedImages.length} 张图片，${failedMessages.length} 张失败：${failedMessages.join("；")}`);
        } else if (failedMessages.length > 0) {
          setCustomImageStatus(`任务 ${jobId}：${failedMessages.join("；")}`);
        } else {
          setCustomImageStatus(generatedImages.length > 0 ? `任务 ${jobId} 已完成 ${generatedImages.length} 张自定义参考图生成` : NO_PREVIEWABLE_IMAGE_MESSAGE);
        }
      } catch (error) {
        updateCustomImageJob(jobId, {
          status: "failed",
          progress: { label: "任务失败", percent: 100 },
          error: error instanceof Error ? error.message : "生图调用失败",
        });
        setCustomImageStatus(error instanceof Error ? error.message : "生图调用失败");
      }
    })();
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
          if (/^(url|image_url|imageUrl|image|output_url|outputUrl|file_url|fileUrl|download_url|downloadUrl|public_url|publicUrl|src|href|b64_json|b64Json|base64|image_base64|imageBase64)$/i.test(key)) {
            const normalizedKey = key.toLowerCase();
            const isBase64Field = normalizedKey.startsWith("b64") || normalizedKey === "base64" || normalizedKey.includes("base64");
            add(isBase64Field ? `data:image/png;base64,${nestedValue}` : nestedValue);
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
    for (const match of result.matchAll(/["'](?:url|image_url|imageUrl|image|output_url|outputUrl|file_url|fileUrl|download_url|downloadUrl|public_url|publicUrl|src)["']\s*:\s*["'](https?:\/\/[^"']+)["']/g)) add(match[1]);
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
      const normalizedLine = line.replace(/^\s*(?:[-*•]\s*)?(?:\d+[.、)]\s*)?/, "");
      const bracketMatch = normalizedLine.match(/^【(人物|角色|场景|物品|道具)】\s*([^：:，,]+)[：:，,]?\s*(.*)$/);
      const labelMatch = normalizedLine.match(/^(人物|角色|场景|物品|道具)[：:]\s*([^：:，,]+)[：:，,]?\s*(.*)$/);
      const namedFieldMatch = normalizedLine.match(/^(?:人物名称|角色名称|姓名|名称)[：:]\s*([^：:，,]+)[：:，,]?\s*(.*)$/);
      const roleIndexMatch = normalizedLine.match(/^(角色|人物)\s*\d+[：:]\s*([^：:，,]+)[：:，,]?\s*(.*)$/);
      const categoryMatch = normalizedLine.match(/^(?:主要人物|出场人物|配角|反派|家人|路人|旁观者)[：:]\s*([^：:，,]+)[：:，,]?\s*(.*)$/);
      const match = bracketMatch ?? labelMatch;
      const type =
        match?.[1] === "角色"
          ? "人物"
          : match?.[1] === "道具"
            ? "物品"
            : match?.[1] ?? (namedFieldMatch || roleIndexMatch || categoryMatch ? "人物" : "");
      if (!type) continue;
      const name = (match?.[2] ?? namedFieldMatch?.[1] ?? roleIndexMatch?.[2] ?? categoryMatch?.[1] ?? "").trim();
      if (!name) continue;
      const followingLines: string[] = [];
      for (let nextIndex = index + 1; nextIndex < draftLines.length; nextIndex += 1) {
        const nextLine = draftLines[nextIndex].trim();
        if (!nextLine) continue;
        const normalizedNextLine = nextLine.replace(/^\s*(?:[-*•]\s*)?(?:\d+[.、)]\s*)?/, "");
        if (
          /^(【(人物|角色|场景|物品|道具)】|(人物|角色|场景|物品|道具)[：:]|(?:人物名称|角色名称|姓名|名称)[：:]|(?:角色|人物)\s*\d+[：:]|(?:主要人物|出场人物|配角|反派|家人|路人|旁观者)[：:])/.test(
            normalizedNextLine,
          )
        )
          break;
        followingLines.push(nextLine);
      }
      const inlineDescription = (match?.[3] ?? namedFieldMatch?.[2] ?? roleIndexMatch?.[3] ?? categoryMatch?.[2] ?? "").trim();
      const description = [inlineDescription, ...followingLines].filter(Boolean).join("\n") || line;
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
    const assetDescription = asset?.description?.trim() || "";
    const sourceText = (assetDescription || inputs.sourceText || "").trim();
    const assetType = (asset?.type || inputs.assetType || "人物").trim();
    const assetTarget = (asset?.name || assetType).trim();
    const visualStyle = (inputs.visualStyle ?? "3D国漫风格").trim();
    const imageRatio = (inputs.imageRatio ?? "16:9").trim();
    const imageResolution = (inputs.imageResolution ?? "1K").trim();

    return [
      "请严格按照以下内容生成单张图片，不要改写为其他题材，不要忽略风格。",
      "最终画面必须是角色/场景/物品资产设定图，不是信息图、不是表格、不是PPT、不是教学海报、不是英文语法图、不是流程图。",
      `画面主体：${assetTarget}`,
      `资产类型：${assetType}`,
      `指定画风：${visualStyle}`,
      `画面比例：${imageRatio}`,
      `目标清晰度：${imageResolution}`,
      "该资产的提取内容：",
      sourceText,
      !assetDescription && inputs.sourceText ? `完整原文背景：${inputs.sourceText}` : "",
      ...(assetType === "人物"
        ? [
            "人物统一后缀：2x2同一人角色设定图。",
            "图片结构强制：正脸特写+侧脸特写+脖子以下全身(脸裁出)+背面全身 + 四格同一人 + Hyperrealistic photographic 35mm film + NOT Caucasian + NOT 3D + 左下格不露脸。",
            "【Layout】2x2 grid：Top-left: FRONT FACE CLOSE-UP（正脸特写）；Top-right: SIDE FACE CLOSE-UP（侧脸特写）；Bottom-left: FULL BODY NECK DOWN, NO FACE（脖子以下全身，脸裁出画面）；Bottom-right: FULL BODY BACK VIEW（背面全身）。",
            "Layout、Top-left、Top-right、Bottom-left、Bottom-right 只是内部构图指令，绝对不要把这些英文或中文说明画进图片里，不要生成任何文字栏、标题栏、表格线或说明卡片。",
            "人物要求：四格必须是同一人、同一服装、同一风格、同一光影；优先遵循“该资产的提取内容”中的人物外貌、整体风格、人物身份和图片结构；不要字幕、水印、logo、编号或额外说明。",
            "服装设计要求：像服装设计总监一样根据人物身份、职业、阶层、年龄、时代地域、生活状态和剧情处境设计服装；不要把所有人物默认生成西装、同款制服、同款黑衣或同一套现代通勤装，除非资产内容明确需要。必须体现剪裁、面料、颜色、磨损、配饰、鞋履或袖口领口等差异化识别点。",
            "脸部原创要求：人物长相必须原创、生活化、有辨识度，不得撞脸当红网红、明星、艺人、博主；不要网红脸、明星同款脸、精修模板脸、韩式爱豆脸或蛇精脸，五官、脸型、肤质和年龄感要服务角色身份。",
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
      "负面限制：不要随机换脸，不要多余文字，不要字幕，不要水印，不要logo，不要编号，不要表格，不要信息图，不要教育海报，不要英文单词排版，不要标题文字，不要畸形手指，不要低清模糊，不要偏离原文内容。",
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
    const panelLayout = step.inputs.panelLayout || "六宫格3x2";
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
    const rawValue = step.inputs[inputKey] ?? defaultValue;
    const value = options.includes(rawValue) ? rawValue : defaultValue && options.includes(defaultValue) ? defaultValue : options[0] ?? "";
    return (
      <label>
        <span>{label}</span>
        <select
          aria-label={label}
          value={value}
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
      (project.currentStep === "xiaotu-skill" && field.key === "sourceText") ||
      (project.currentStep === "seedance-video" && field.key === "videoPromptSource") ||
      (project.currentStep === "script-polish" && field.key === "sourceText") ||
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
      const options =
        project.currentStep === "asset-extraction" && field.key === "imageResolution"
          ? getAssetImageResolutionOptions(step.inputs.imageModel ?? "gpt-image-2")
          : field.options ?? [];
      const selectValue = options.includes(value) ? value : field.defaultValue && options.includes(field.defaultValue) ? field.defaultValue : options[0] ?? "";
      return (
        <select
          aria-label={field.label}
          value={selectValue}
          onChange={(event) => updateInput(field.key, event.target.value)}
        >
          {options.map((option) => (
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
                closeImagePreview();
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
                  <button className="ghost-button" type="button" onClick={closeImagePreview}>
                    关闭
                  </button>
                </div>
              </div>
              <div className="image-preview-stage">
                {previewImage.previewSrc ? (
                  <img
                    alt={`高清预览：${previewImage.alt}`}
                    src={previewImage.previewSrc}
                    style={{ transform: `scale(${previewScale})` }}
                  />
                ) : (
                  <p className="muted">正在准备高清预览...</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  if (project.currentStep === "seedance-video") {
    return (
      <section className="workspace">
        <div className="workspace-header">
          <div>
            <p className="eyebrow">当前步骤</p>
            <h2>{template.name}</h2>
            <p>{template.description}</p>
          </div>
        </div>

        <div aria-label="SEEDANCE2.0 视频生成区" className="asset-generation-panel">
          <div className="section-heading">
            <h3>SEEDANCE2.0 视频生成区</h3>
            <div className="heading-actions">
              <button className="secondary-button" disabled={currentGeneration.isCalling} onClick={runAi}>
                <Bot size={16} />
                {currentGeneration.isCalling ? "生成中" : "整理提示词"}
              </button>
              <button className="secondary-button" onClick={clearResults}>
                <Trash2 size={16} />
                一键清除
              </button>
            </div>
          </div>

          <div className="seedance-parameter-panel">
            <div className="section-heading compact-heading">
              <h3>生成参数</h3>
            </div>
            <div className="storyboard-image-settings seedance-generation-settings">
              {renderTemplateSelectControl("modeType")}
              <label>
                <span>视频时长（秒）</span>
                <input
                  aria-label="视频时长（秒）"
                  max={15}
                  min={1}
                  type="number"
                  value={step.inputs.seconds ?? "5"}
                  onChange={(event) => updateInput("seconds", event.target.value)}
                />
              </label>
              <label>
                <span>生成数量</span>
                <input
                  aria-label="视频生成数量"
                  max={6}
                  min={1}
                  type="number"
                  value={step.inputs.seedanceVideoCount ?? "1"}
                  onChange={(event) => updateInput("seedanceVideoCount", event.target.value)}
                />
              </label>
              {renderTemplateSelectControl("size")}
              {renderTemplateSelectControl("visualStyle")}
              <label>
                <span>线路 Channel</span>
                <select aria-label="线路 Channel" value={step.inputs.seedanceChannel ?? "test"} onChange={(event) => updateSeedanceChannel(event.target.value)}>
                  <option value="test">test（测试线路）</option>
                  {(seedanceVideoConfig?.channels ?? []).map((channel) => (
                    <option key={channel.channel} value={channel.channel}>
                      {channel.channel}｜{channel.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>模型 Model</span>
                <select aria-label="模型 Model" value={step.inputs.seedanceModel ?? "test-video"} onChange={(event) => updateSeedanceModel(event.target.value)}>
                  {seedanceAvailableModels.length === 0 ? <option value="test-video">test-video（测试模型）</option> : null}
                  {seedanceAvailableModels.map((model) => (
                    <option key={`${model.model}-${model.label}`} value={model.model}>
                      {model.model}｜{model.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <details className="seedance-advanced-settings seedance-api-settings">
              <summary>API 地址与 KEY</summary>
              <div className="storyboard-image-settings">
                <label>
                  <span className="inline-field-heading">
                    API 地址
                    <button
                      className="text-link-button"
                      type="button"
                      onClick={() => window.open("https://video.aistarslab.com/signup?invite_code=jWZhc", "_blank", "noopener,noreferrer")}
                    >
                      注册
                    </button>
                  </span>
                  <input aria-label="AIStartLab API 地址" value={step.inputs.seedanceEndpoint ?? "/api/aistarslab/openapi"} placeholder="/api/aistarslab/openapi" onChange={(event) => updateInput("seedanceEndpoint", event.target.value)} />
                </label>
                <label>
                  <span className="inline-field-heading">
                    API KEY
                    <button className="text-link-button" disabled={isLoadingSeedanceConfig} type="button" onClick={loadSeedanceVideoConfig}>
                      {isLoadingSeedanceConfig ? "测试中" : "测试连接"}
                    </button>
                  </span>
                  <input aria-label="AIStartLab API KEY" placeholder="默认复用弹窗 API KEY，也可单独填写" type="password" value={step.inputs.seedanceApiKey ?? ""} onChange={(event) => updateInput("seedanceApiKey", event.target.value)} />
                </label>
              </div>
              {seedanceConnectionStatus ? (
                <p className={seedanceConnectionStatus.startsWith("连接失败") ? "error-text" : "success-text"}>
                  {seedanceConnectionStatus}
                </p>
              ) : null}
            </details>
          </div>

          <label className="wide-field seedance-prompt-field">
            <span>
              小说/剧本/分镜/视频提示词
              <b>必填</b>
            </span>
            <div
              className="import-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const files = Array.from(event.dataTransfer.files);
                const textFile = files.find((file) => /^text\/|json|markdown|csv|srt|vtt/i.test(file.type) || /\.(txt|md|csv|json|srt|vtt|log)$/i.test(file.name));
                const mediaFiles = files.filter((file) => file !== textFile);
                if (textFile) void importTextFile(textFile, "videoPromptSource");
                if (mediaFiles.length > 0) void uploadSeedanceMaterials(mediaFiles);
              }}
            >
              <textarea
                aria-label="小说/剧本/分镜/视频提示词"
                ref={seedancePromptTextareaRef}
                value={step.inputs.videoPromptSource ?? ""}
                onChange={(event) => {
                  updateInput("videoPromptSource", event.target.value);
                  refreshSeedanceMentionPicker(event.currentTarget);
                }}
                onClick={(event) => refreshSeedanceMentionPicker(event.currentTarget)}
                onKeyUp={(event) => refreshSeedanceMentionPicker(event.currentTarget)}
              />
              {seedanceMentionQuery !== null ? (
                <div className="seedance-mention-picker" aria-label="参考素材选择">
                  {seedanceMentionOptions.length > 0 ? (
                    seedanceMentionOptions.map((item) => (
                      <button key={item.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertSeedanceMaterialMention(item, true)}>
                        <span>{item.name}</span>
                        <small>{item.type === "image" ? "图片" : item.type === "video" ? "视频" : "音频"}</small>
                      </button>
                    ))
                  ) : (
                    <p className="muted">没有匹配的参考素材，请先上传或换个关键词。</p>
                  )}
                </div>
              ) : null}
              <div className="import-tools">
                <label className="file-import-button">
                  <FileUp size={16} />
                  导入文档
                  <input
                    accept=".txt,.md,.csv,.json,.srt,.vtt,.log,.text"
                    aria-label="导入文档"
                    type="file"
                    onChange={(event) => {
                      void importTextFile(event.target.files?.[0], "videoPromptSource");
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <label className="file-import-button">
                  <FileUp size={16} />
                  {isUploadingSeedanceMaterial ? "上传中" : "上传素材"}
                  <input
                    accept="image/*,video/*,audio/*"
                    aria-label="上传 SEEDANCE 参考素材"
                    multiple
                    type="file"
                    onChange={(event) => {
                      void uploadSeedanceMaterials(event.target.files ?? []);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <button className="secondary-button" type="button" onClick={() => updateInput("videoPromptSource", "")}>
                  <Trash2 size={16} />
                  清除文案
                </button>
                <button className="secondary-button" type="button" onClick={runSeedanceVideoGeneration}>
                  <Play size={16} />
                  生成视频
                </button>
                <span>支持导入文本，也可以拖入图片、视频、音频作为参考素材。</span>
              </div>
            </div>
          </label>

          <div
            className="custom-image-panel seedance-material-panel"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void uploadSeedanceMaterials(event.dataTransfer.files);
            }}
          >
            <div className="section-heading">
              <h3>参考素材</h3>
            </div>
            <p className="muted">拖入或导入图片、视频、音频即可作为参考素材；无素材时自动按文生视频，有素材时自动按参考生视频。</p>
            <div className="seedance-material-grid">
              {visibleSeedanceMaterials.length > 0 ? (
                visibleSeedanceMaterials.map((item) => (
                  <article className="seedance-material-card" key={item.id}>
                    {item.type === "image" ? <img alt={item.name} src={item.url} /> : item.type === "video" ? <video src={item.url} /> : <div className="seedance-audio-card">音频</div>}
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.type === "image" ? "图片参考" : item.type === "video" ? "视频参考" : "音频参考"}</span>
                    </div>
                    <div className="heading-actions">
                      <button className="secondary-button" onClick={() => insertSeedanceMaterialMention(item)}>
                        @调用
                      </button>
                      <button className="danger-button" onClick={() => removeSeedanceMaterial(item)}>
                        删除
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="muted">暂无参考素材。可以直接文生视频，也可以拖入素材进行图生/参考生视频。</p>
              )}
            </div>
          </div>

          {seedanceVideoStatus ? <div className="status-line">{seedanceVideoStatus}</div> : null}
          {seedanceCredits !== null ? <p className="muted">当前账号积分：{seedanceCredits}</p> : null}
          {seedanceVideoTask ? (
            <p className="muted">
              当前任务：{seedanceVideoTask.taskId} ｜ 状态 {seedanceVideoTask.status}
              {typeof seedanceVideoTask.costCredits === "number" ? ` ｜ 消耗 ${seedanceVideoTask.costCredits} 积分` : ""}
            </p>
          ) : null}
          {seedanceVideoProgress ? (
            <div className="generation-progress" aria-label="SEEDANCE视频生成进度" aria-live="polite">
              <div className="progress-header">
                <strong>视频生成进度</strong>
                <span>{seedanceVideoProgress.label}</span>
                <b>{seedanceVideoProgress.percent}%</b>
              </div>
              <div aria-label="SEEDANCE视频生成进度" aria-valuemax={100} aria-valuemin={0} aria-valuenow={seedanceVideoProgress.percent} className="progress-track" role="progressbar">
                <div className="progress-fill" style={{ width: `${seedanceVideoProgress.percent}%` }} />
              </div>
            </div>
          ) : null}

          {seedanceVideoJobs.length > 0 ? (
            <div className="seedance-job-panel" aria-label="SEEDANCE视频任务进度">
              <div className="section-heading compact-heading">
                <h3>视频任务列表</h3>
                <div className="heading-actions">
                  <button className="secondary-button" onClick={() => setSeedanceVideoJobs([])}>
                    <Trash2 size={16} />
                    一键清除
                  </button>
                </div>
              </div>
              <div className="seedance-job-list">
                {seedanceVideoJobs.map((job) => (
                  <article className={`seedance-job-card seedance-job-card-${job.status}`} key={job.id}>
                    <div className="progress-header">
                      <strong>视频 {job.index}</strong>
                      <span>{job.taskId ? `任务 ${job.taskId}` : job.label}</span>
                      <b>{job.percent}%</b>
                    </div>
                    <div aria-label={`视频${job.index}生成进度`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={job.percent} className="progress-track" role="progressbar">
                      <div className="progress-fill" style={{ width: `${job.percent}%` }} />
                    </div>
                    <p className={job.status === "failed" ? "error-text" : "muted"}>
                      {job.error ?? job.label}
                    </p>
                    <div className="heading-actions">
                      {job.result ? (
                        <>
                          <button className="secondary-button" onClick={() => window.open(job.result?.url, "_blank", "noopener,noreferrer")}>
                            <Download size={16} />
                            打开下载
                          </button>
                          <button className="secondary-button" onClick={() => copyText(job.result?.url ?? "", "视频链接")}>
                            <Clipboard size={16} />
                            复制链接
                          </button>
                        </>
                      ) : null}
                      <button className="danger-button" onClick={() => setSeedanceVideoJobs((current) => current.filter((item) => item.id !== job.id))}>
                        <Trash2 size={16} />
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {seedanceVideoResults.length > 0 ? (
            <div className="image-results seedance-video-results" aria-label="视频生成结果预览">
              <div className="section-heading">
                <h3>视频生成结果预览</h3>
              </div>
              <div className="image-result-grid seedance-video-result-grid">
                {seedanceVideoResults.map((result, index) => (
                  <figure className="image-result-card seedance-video-result-card" key={result.id}>
                    <div className="seedance-video-frame">
                      <video aria-label={`视频 ${index + 1} 预览`} className="seedance-video-thumbnail" controls src={result.url} />
                    </div>
                    <figcaption>
                      <span>
                        视频 {index + 1} ｜ {result.model} ｜ {result.seconds}s ｜ {result.size}
                      </span>
                      <button className="secondary-button image-download-link" onClick={() => window.open(result.url, "_blank", "noopener,noreferrer")}>
                        <Download size={16} />
                        打开下载
                      </button>
                      <button className="secondary-button image-save-link" onClick={() => copyText(result.url, "视频链接")}>
                        <Clipboard size={16} />
                        复制链接
                      </button>
                      <button className="danger-button image-delete-button" onClick={() => setSeedanceVideoResults((current) => current.filter((item) => item.id !== result.id))}>
                        <Trash2 size={16} />
                        删除
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="section-heading">
          <h3>生成结果 / 外部粘贴区</h3>
          <div className="heading-actions">
            <button className="secondary-button" onClick={() => copyText(visibleDraft, "结果")}>
              <Clipboard size={16} />
              复制
            </button>
            <button className="secondary-button" onClick={() => downloadTextFile(visibleDraft, "结果")}>
              <Download size={16} />
              导出 TXT
            </button>
          </div>
        </div>
        <textarea className="result-editor" placeholder="整理后的视频提示词会显示在这里，也可以手动粘贴。" value={visibleDraft} onChange={(event) => updateDraft(event.target.value)} />
      </section>
    );
  }

  return (
    <section className="workspace">
      {project.currentStep !== "custom-image" ? (
        <div className="workspace-header">
          <div>
            <p className="eyebrow">当前步骤</p>
            <h2>{template.name}</h2>
            <p>{template.description}</p>
          </div>
        </div>
      ) : null}

      <div className="form-grid">
        {template.fields
          .filter(
            (field) =>
              (project.currentStep !== "gpt-image2-storyboard" || field.key === "sourceText") &&
              project.currentStep !== "custom-image",
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
              <label className="inline-select-control">
                <span>推荐文风</span>
                <select
                  aria-label="推荐文风"
                  value={step.inputs.style ?? "贴合大纲气质"}
                  onChange={(event) => updateInput("style", event.target.value)}
                >
                  {NOVEL_STYLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
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

      {project.currentStep !== "custom-image" ? (
        <div className="ai-model-summary" aria-label="当前 AI 模型">
          <span>当前文本模型：{aiSettings.model}</span>
          <span>Gemini 生图备用：{aiSettings.geminiImageModel || "未设置"}</span>
        </div>
      ) : null}

      <div className="action-row">
        {project.currentStep !== "custom-image" ? (
          <button onClick={runAi} disabled={currentGeneration.isCalling}>
            <Bot size={16} />
            {currentGeneration.isCalling ? "生成中" : "调用 AI 生成"}
          </button>
        ) : null}
        {project.currentStep === "storyboard-15s" || project.currentStep === "xiaotu-skill" ? (
            <button className="secondary-button" disabled={isSendingToZzdh || !visibleDraft.trim()} onClick={sendCurrentStoryboardToZzdh}>
            <Play size={16} />
            {isSendingToZzdh ? "发送中" : project.currentStep === "xiaotu-skill" ? "发送到字字动画" : "发送分镜到字字动画"}
          </button>
        ) : null}
        {project.currentStep === "storyboard-15s" ? (
          <button className="secondary-button" onClick={runSeedanceSafetyCheck}>
            SEEDAN2.0违禁词检测
          </button>
        ) : null}
        {project.currentStep !== "custom-image" ? (
          <>
            <button className="secondary-button" onClick={() => onSaveVersion(visibleDraft)}>
              <Save size={16} />
              保存结果
            </button>
            <button className="ghost-button" onClick={() => copyText(visibleDraft, "结果")}>
              <Play size={16} />
              复制结果
            </button>
          </>
        ) : null}
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

      {project.currentStep !== "custom-image" ? (
        <>
          <div className="section-heading">
            <h3>生成结果 / 外部粘贴区</h3>
            <div className="heading-actions">
              <button className="secondary-button" onClick={() => copyText(visibleDraft, "结果")}>
                <Clipboard size={16} />
                复制
              </button>
              {project.currentStep === "chapter-split" ? (
                <button className="secondary-button" onClick={continueToProseGeneration}>
                  下一步：正文生成
                </button>
              ) : null}
              <button className="secondary-button" onClick={() => downloadTextFile(visibleDraft, "结果")}>
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
            value={visibleDraft}
            onChange={(event) => updateDraft(event.target.value)}
          />
        </>
      ) : null}

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
          <p className="muted">会读取上方生成结果中的 GPT-image-2 出图提示词，并按六宫格3x2布局、比例和影像风格生成故事板图片。</p>
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
      {project.currentStep === "custom-image" ? (
        <div className="asset-generation-panel">
          <div className="section-heading">
            <h3>第9项：自定义参考图出图</h3>
            <div className="heading-actions">
              <button className="secondary-button" onClick={clearCustomImageWorkspace}>
                <Trash2 size={16} />
                一键清空
              </button>
            </div>
          </div>
          <div
            className="custom-image-panel import-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void importCustomImageReferences(event.dataTransfer.files);
            }}
          >
            <div className="section-heading">
              <h3>参考图片</h3>
              <div className="heading-actions">
                <label className="file-import-button">
                  <FileUp size={16} />
                  上传参考图
                  <input
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,image/tiff"
                    aria-label="上传参考图片"
                    multiple
                    type="file"
                    onChange={(event) => {
                      void importCustomImageReferences(event.target.files ?? []);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <p className="muted">支持拖拽或本地导入，最多14张。提示词里可写 @参考图片 1、@参考图片 2，也可以点击下方 @调用。</p>
            {customImageReferences.length > 0 ? (
              <div className="seedance-material-grid">
                {customImageReferences.map((item, index) => (
                  <article className="seedance-material-card" key={item.id}>
                    <img alt={`参考图片 ${index + 1}`} src={item.src} />
                    <div>
                      <strong>参考图片 {index + 1}</strong>
                      <span>{item.name}</span>
                    </div>
                    <div className="asset-library-actions">
                      <button className="secondary-button" onClick={() => insertCustomImageReferenceMention(index)}>
                        @调用
                      </button>
                      <button className="danger-button" onClick={() => removeCustomImageReference(item.id)}>
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">还没有参考图片。可以直接拖入图片，或先只用文字提示词生成。</p>
            )}

            <label className="wide-field">
              <span>主提示词 <b>必填</b></span>
              <textarea
                aria-label="主提示词"
                ref={customImagePromptRef}
                value={step.inputs.referencePrompt ?? ""}
                onChange={(event) => {
                  updateInput("referencePrompt", event.target.value);
                  refreshCustomImageMentionPicker(event.currentTarget);
                }}
                onClick={(event) => refreshCustomImageMentionPicker(event.currentTarget)}
                onKeyUp={(event) => refreshCustomImageMentionPicker(event.currentTarget)}
                placeholder="例如：@参考图片 1 保持人物五官和发型不变，改成夜雨街头电影感半身照，冷蓝侧逆光。"
              />
              {customImageMentionQuery !== null ? (
                <div className="seedance-mention-picker" aria-label="第9项参考图片选择">
                  {customImageMentionOptions.length > 0 ? (
                    customImageMentionOptions.map((item) => {
                      const referenceIndex = customImageReferences.findIndex((reference) => reference.id === item.id);
                      return (
                        <button key={item.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertCustomImageReferenceMentionFromPicker(referenceIndex)}>
                          <span>参考图片 {referenceIndex + 1}</span>
                          <small>{item.name}</small>
                        </button>
                      );
                    })
                  ) : (
                    <p className="muted">没有匹配的参考图片，请先上传或换个关键词。</p>
                  )}
                </div>
              ) : null}
            </label>

            <div className="storyboard-image-settings">
              {renderSelectControl("生图模型", "imageModel", IMAGE_MODEL_OPTIONS, "gpt-image-2")}
              {renderTemplateSelectControl("imageRatio")}
              {renderTemplateSelectControl("imageResolution")}
              <label>
                <span>出图数量</span>
                <input
                  aria-label="出图数量"
                  max={12}
                  min={1}
                  type="number"
                  value={step.inputs.imageCount ?? "1"}
                  onChange={(event) => updateInput("imageCount", event.target.value)}
                />
              </label>
              <button className="secondary-button" onClick={runCustomImageGeneration}>
                <FileImage size={16} />
                生成图片
              </button>
            </div>
          </div>
          {customImageJobs.length > 0 ? (
            <div className="task-center" aria-label="第9项任务列表">
              <div className="section-heading">
                <h3>第9项任务列表</h3>
              </div>
              <div className="task-list">
                {customImageJobs.map((job) => (
                  <article className="task-item" key={job.id}>
                    <div>
                      <strong>{job.label}</strong>
                      <span>{job.status === "queued" ? "排队中" : job.status === "generating" ? "生成中" : job.status === "completed" ? "完成" : "失败"}</span>
                    </div>
                    <p>{job.progress.label}</p>
                    <div
                      aria-label={`${job.label}进度`}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={job.progress.percent}
                      className="progress-track"
                      role="progressbar"
                    >
                      <div className="progress-fill" style={{ width: `${job.progress.percent}%` }} />
                    </div>
                    {job.error ? <small className="muted">{job.error}</small> : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}
          {customImageStatus ? <div className="status-line">{customImageStatus}</div> : null}
          {customImageProgress ? (
            <div className="generation-progress" aria-label="第9项图片生成进度" aria-live="polite">
              <div className="progress-header">
                <strong>第9项生图进度</strong>
                <span>{customImageProgress.label}</span>
                <b>{customImageProgress.percent}%</b>
              </div>
              <div
                aria-label="第9项图片生成进度"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={customImageProgress.percent}
                className="progress-track"
                role="progressbar"
              >
                <div className="progress-fill" style={{ width: `${customImageProgress.percent}%` }} />
              </div>
            </div>
          ) : null}
          {renderImageResultsPanel(customImageResults, "第9项生图结果预览")}
        </div>
      ) : null}
      {previewImage ? (
        <div
          className="image-preview-backdrop"
          role="dialog"
          aria-label="图片高清预览"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeImagePreview();
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
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => downloadImageFile(previewImage.src, previewImage.filename)}
                >
                  <Download size={16} />
                  下载原图
                </button>
                <button className="ghost-button" type="button" onClick={closeImagePreview}>
                  关闭
                </button>
              </div>
            </div>
            <div className="image-preview-stage">
              {previewImage.previewSrc ? (
                <img
                  alt={`高清预览：${previewImage.alt}`}
                  src={previewImage.previewSrc}
                  style={{ transform: `scale(${previewScale})` }}
                />
              ) : (
                <p className="muted">正在准备高清预览...</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

