export type ZzdhPanelPayload = {
  paperwork: string;
  prompt: string;
  video_prompt: string;
  negative_prompt: string;
};

export type ZzdhCreateProjectPayload = {
  name: string;
  type: "paperwork";
  content: string;
  panels: ZzdhPanelPayload[];
};

export type ZzdhToolResult = {
  success?: boolean;
  [key: string]: unknown;
};

export type ZzdhAssetPayload = {
  name: string;
  type: string;
  description: string;
};

export type ZzdhAssetSendResult = {
  created: Array<ZzdhAssetPayload & { entityType: ZzdhEntityType; entityId?: string }>;
  skippedExisting: Array<ZzdhAssetPayload & { entityType: ZzdhEntityType; entityId?: string }>;
  failed: Array<ZzdhAssetPayload & { entityType: ZzdhEntityType; error: string }>;
};

type ZzdhPanelInfo = {
  unique_name?: string;
  [key: string]: unknown;
};

type ZzdhEntityType = "character" | "location" | "item";

const ZZDH_TOOL_ENDPOINT = "http://127.0.0.1:8766/v1/tools/call";

export async function sendStoryboardToZzdh(
  projectName: string,
  storyboardText: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ZzdhToolResult> {
  const panels = parseStoryboardPanels(storyboardText);
  if (panels.length === 0) throw new Error("没有可发送的分镜内容，请先生成或粘贴15S分镜脚本。");

  const payload: ZzdhCreateProjectPayload = {
    name: `${projectName || "小兔助手项目"}-字字动画`,
    type: "paperwork",
    content: getPaperworkTitle(panels[0].paperwork),
    panels: [
      {
        paperwork: getPaperworkTitle(panels[0].paperwork),
        prompt: "",
        video_prompt: "",
        negative_prompt: "",
      },
    ],
  };

  const result = await callZzdhTool("zzdh_create_and_open_project", payload, fetchImpl);
  await callZzdhTool("zzdh_switch_media_mode", { mode: "video" }, fetchImpl);
  await writeStoryboardPanelsToSeparateVideoPrompts(panels, fetchImpl);
  return result;
}

export function parseStoryboardPanels(storyboardText: string): ZzdhPanelPayload[] {
  const cleanedText = storyboardText.trim();
  if (!cleanedText) return [];

  const segments = splitStoryboardSegments(cleanedText);
  return segments.map((segment, index) => {
    const title = extractSegmentTitle(segment, index + 1);
    const videoPrompt = normalizePanelText(segment);
    return {
      paperwork: extractPanelPaperwork(segment, title),
      prompt: "",
      video_prompt: videoPrompt,
      negative_prompt: "不要字幕水印，不要随机换脸，不要角色漂移，不要画面闪烁。",
    };
  });
}

export async function sendAssetsToZzdh(
  assets: ZzdhAssetPayload[],
  fetchImpl: typeof fetch = fetch,
): Promise<ZzdhAssetSendResult> {
  const normalizedAssets = assets
    .map((asset) => ({
      ...asset,
      name: asset.name.trim(),
      description: asset.description.trim(),
      entityType: mapAssetTypeToZzdhEntityType(asset.type),
    }))
    .filter((asset): asset is ZzdhAssetPayload & { entityType: ZzdhEntityType } => Boolean(asset.name && asset.entityType));

  if (normalizedAssets.length === 0) {
    throw new Error("没有可发送到字字动画的资产。请先提取人物、场景或物品。");
  }

  const result: ZzdhAssetSendResult = {
    created: [],
    skippedExisting: [],
    failed: [],
  };

  const existingByType = new Map<ZzdhEntityType, ZzdhToolResult[]>();
  for (const entityType of ["character", "location", "item"] as ZzdhEntityType[]) {
    const listResult = await callZzdhTool("zzdh_get_entity_list", { entity_type: entityType }, fetchImpl);
    existingByType.set(entityType, extractZzdhEntities(listResult));
  }

  const seen = new Set<string>();
  for (const asset of normalizedAssets) {
    const dedupeKey = `${asset.entityType}:${normalizeEntityName(asset.name)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const existing = findExistingEntity(existingByType.get(asset.entityType) ?? [], asset.name, asset.entityType);
    if (existing) {
      result.skippedExisting.push({
        name: asset.name,
        type: asset.type,
        description: asset.description,
        entityType: asset.entityType,
        entityId: existing.entityId,
      });
      continue;
    }

    try {
      const createResult = await callZzdhTool(
        "zzdh_create_entity",
        {
          entity_type: asset.entityType,
          name: asset.name,
          description: asset.description,
          alias: "",
          auto_show: true,
        },
        fetchImpl,
      );
      const entityId = typeof createResult.entity_id === "string" ? createResult.entity_id : undefined;
      result.created.push({
        name: asset.name,
        type: asset.type,
        description: asset.description,
        entityType: asset.entityType,
        entityId,
      });
      existingByType.set(asset.entityType, [
        ...(existingByType.get(asset.entityType) ?? []),
        { ...createResult, name: asset.name, entity_id: entityId },
      ]);
    } catch (error) {
      result.failed.push({
        name: asset.name,
        type: asset.type,
        description: asset.description,
        entityType: asset.entityType,
        error: error instanceof Error ? error.message : "创建资产失败",
      });
    }
  }

  return result;
}

async function callZzdhTool(
  name: string,
  argumentsPayload: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<ZzdhToolResult> {
  let response: Response;
  try {
    response = await fetchImpl(ZZDH_TOOL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        arguments: argumentsPayload,
      }),
    });
  } catch (error) {
    if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
      throw new Error("无法连接本机字字动画。请先启动字字动画，并确认本机 8766 服务正常运行后重试。");
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(buildZzdhHttpErrorMessage(response.status));
  }

  const result = (await response.json()) as ZzdhToolResult;
  if (result.success === false) {
    throw new Error(typeof result.error === "string" ? result.error : "字字动画返回失败");
  }
  return result;
}

async function writeStoryboardPanelsToSeparateVideoPrompts(
  panels: ZzdhPanelPayload[],
  fetchImpl: typeof fetch,
): Promise<void> {
  let zzdhPanels = await getZzdhPanels(fetchImpl);
  if (zzdhPanels.length === 0) {
    const addedPanel = await callZzdhTool("zzdh_add_panel", {}, fetchImpl);
    zzdhPanels = [addedPanel as ZzdhPanelInfo];
  }

  while (zzdhPanels.length < panels.length) {
    const previousPanel = zzdhPanels[zzdhPanels.length - 1];
    const afterUniqueName = typeof previousPanel.unique_name === "string" ? previousPanel.unique_name : undefined;
    const addedPanel = await callZzdhTool(
      "zzdh_add_panel",
      afterUniqueName ? { after_unique_name: afterUniqueName } : {},
      fetchImpl,
    );
    if (typeof addedPanel.unique_name === "string" && addedPanel.unique_name.trim()) {
      zzdhPanels = [...zzdhPanels, addedPanel as ZzdhPanelInfo];
    } else {
      zzdhPanels = await waitForZzdhPanelCount(zzdhPanels.length + 1, fetchImpl);
    }
  }

  while (zzdhPanels.length > panels.length) {
    const extraPanel = zzdhPanels[zzdhPanels.length - 1];
    if (typeof extraPanel.unique_name === "string" && extraPanel.unique_name.trim()) {
      await callZzdhTool("zzdh_delete_panel", { unique_name: extraPanel.unique_name }, fetchImpl);
    }
    zzdhPanels = zzdhPanels.slice(0, -1);
  }

  const targetPanels = zzdhPanels.slice(0, panels.length);

  for (let index = 0; index < panels.length; index += 1) {
    const uniqueName = targetPanels[index]?.unique_name;
    if (typeof uniqueName !== "string" || !uniqueName.trim()) continue;
    await callZzdhTool(
      "zzdh_update_paperwork",
      {
        unique_name: uniqueName,
        paperwork: panels[index].paperwork,
      },
      fetchImpl,
    );
    await callZzdhTool(
      "zzdh_switch_prompt_mode",
      {
        unique_name: uniqueName,
        is_video: true,
      },
      fetchImpl,
    );
    await callZzdhTool(
      "zzdh_update_video_prompt",
      {
        unique_name: uniqueName,
        video_prompt: panels[index].video_prompt,
      },
      fetchImpl,
    );
  }
}

function getPaperworkTitle(paperwork: string): string {
  return paperwork
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "15S分镜单元";
}

async function getZzdhPanels(fetchImpl: typeof fetch): Promise<ZzdhPanelInfo[]> {
  const panelListResult = await callZzdhTool("zzdh_get_panels", {}, fetchImpl);
  return Array.isArray(panelListResult.panels) ? (panelListResult.panels as ZzdhPanelInfo[]) : [];
}

async function waitForZzdhPanelCount(expectedCount: number, fetchImpl: typeof fetch): Promise<ZzdhPanelInfo[]> {
  let lastPanels: ZzdhPanelInfo[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    lastPanels = await getZzdhPanels(fetchImpl);
    if (lastPanels.length >= expectedCount) return lastPanels;
    await delay(180);
  }
  return lastPanels;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds);
  });
}

function splitStoryboardSegments(text: string): string[] {
  const xiaotuSkillMatches = [
    ...text.matchAll(
      /(?:^|\n)(?=(?:#{1,6}\s*)?(?:[【\[]?\s*(?:段落\s*[一二三四五六七八九十百千万\d]+|第\s*[一二三四五六七八九十百千万\d]+\s*段)[^\n]*(?:一镜到底|多机位分镜)[】\]]?|剧情\s*[一二三四五六七八九十百千万\d]+\s*[:：]))/g,
    ),
  ];
  if (xiaotuSkillMatches.length > 1) {
    return xiaotuSkillMatches
      .map((match, index) => {
        const start = match.index ?? 0;
        const end = xiaotuSkillMatches[index + 1]?.index ?? text.length;
        return text.slice(start, end).trim();
      })
      .filter(Boolean);
  }

  const segmentMatches = [
    ...text.matchAll(
      /(?:^|\n)(?=(?:#{1,6}\s*)?(?:[【\[]?\s*第\s*\d+\s*(?:段|组|幕|个\s*15S|个15S)(?:\s*单元)?|[【\[]?\s*(?:15S\s*)?(?:段落|单元|段落单元|分镜单元)\s*\d+|[【\[]?\s*单元段落\s*\d+|[【\[]?\s*Segment\s*\d+))/gi,
    ),
  ];
  if (segmentMatches.length > 1) {
    return segmentMatches
      .map((match, index) => {
        const start = match.index ?? 0;
        const end = segmentMatches[index + 1]?.index ?? text.length;
        return text.slice(start, end).trim();
      })
      .filter(Boolean);
  }

  const dividerSegments = text
    .split(/\n\s*(?:---+|={3,}|_::~FIELD::~_)\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
  if (dividerSegments.length > 1) return dividerSegments;

  return [text];
}

function extractSegmentTitle(segment: string, index: number): string {
  const firstLine = segment
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return `第${index}段15S分镜`;

  const compact = firstLine.replace(/^#+\s*/, "").replace(/[【】]/g, "").trim();
  if (compact.length <= 32) return compact;

  const shotTitle = compact.match(/分镜\s*\d+\s*([^（(：:]{1,18})/)?.[1]?.trim();
  return shotTitle ? `第${index}段：${shotTitle}` : `第${index}段15S分镜`;
}

function extractPanelPaperwork(segment: string, title: string): string {
  const lines = segment
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const storyLines = lines
    .filter((line) => !isVisualPromptLine(line))
    .map((line) => stripShotTiming(line))
    .filter(Boolean);

  if (storyLines.length > 1) return storyLines.join("\n");
  const contentLines = extractVisualContentLines(lines);
  if (contentLines.length > 0) return [title, ...contentLines].join("\n");
  return title;
}

function isVisualPromptLine(line: string): boolean {
  return (
    /^【(?:视觉基调|色彩与影调|光源与照明|画面情绪|主体和空间关系|负面限制)】/.test(line) ||
    /^负面限制[:：]/.test(line)
  );
}

function extractVisualContentLines(lines: string[]): string[] {
  const contentStart = lines.findIndex((line) => /^【画面内容】/.test(line));
  if (contentStart < 0) return [];
  return lines
    .slice(contentStart)
    .map((line) => line.replace(/^【画面内容】\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^负面限制[:：]/.test(line))
    .map((line) => stripShotTiming(line));
}

function stripShotTiming(line: string): string {
  return line
    .replace(/^(分镜\s*\d+\s*[^（(：:]{0,16})[（(][^）)]*[）)]\s*[：:]/, "$1：")
    .trim();
}

function normalizePanelText(segment: string): string {
  return segment
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mapAssetTypeToZzdhEntityType(type: string): ZzdhEntityType | null {
  if (type === "人物" || type === "角色") return "character";
  if (type === "场景") return "location";
  if (type === "物品" || type === "道具") return "item";
  return null;
}

function extractZzdhEntities(result: ZzdhToolResult): ZzdhToolResult[] {
  const raw = result.entities ?? result.items ?? (isRecord(result.data) ? result.data.entities ?? result.data.items : undefined);
  if (Array.isArray(raw)) return raw.filter(isRecord);
  if (isRecord(raw)) return Object.values(raw).filter(isRecord);
  return [];
}

function findExistingEntity(
  entities: ZzdhToolResult[],
  name: string,
  entityType: ZzdhEntityType,
): { entityId?: string } | null {
  const targetName = normalizeEntityName(name);
  for (const entity of entities) {
    const entityName = typeof entity.name === "string" ? entity.name : "";
    if (normalizeEntityName(entityName) !== targetName) continue;
    const idKeys =
      entityType === "character"
        ? ["character_id", "entity_id", "id"]
        : entityType === "location"
          ? ["location_id", "scene_id", "entity_id", "id"]
          : ["item_id", "entity_id", "id"];
    const entityId = idKeys.map((key) => entity[key]).find((value): value is string => typeof value === "string");
    return { entityId };
  }
  return null;
}

function normalizeEntityName(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

function isRecord(value: unknown): value is ZzdhToolResult {
  return typeof value === "object" && value !== null;
}

function buildZzdhHttpErrorMessage(status: number): string {
  if (status === 404) return "连接字字动画失败：未找到接口。请确认字字动画已启动，并且 MCP 服务监听在 127.0.0.1:8766。";
  if (status >= 500) return `连接字字动画失败：HTTP ${status}。请重启字字动画后再试。`;
  return `连接字字动画失败：HTTP ${status}`;
}
