export type AssetLibraryType = "人物" | "场景" | "物品";

export type AssetLibraryItem = {
  id: string;
  type: AssetLibraryType;
  name: string;
  src: string;
  prompt: string;
  model: string;
  ratio: string;
  resolution: string;
  saveDirectory: string;
  createdAt: string;
};

export type AssetLibraryInput = Omit<AssetLibraryItem, "id" | "createdAt" | "saveDirectory"> & {
  saveDirectory?: string;
};

const STORAGE_KEY = "novel-script-tool.asset-library";

function now() {
  return new Date().toISOString();
}

function makeId() {
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAssetType(type: unknown): AssetLibraryType {
  if (type === "场景") return "场景";
  if (type === "物品" || type === "道具") return "物品";
  return "人物";
}

function normalizeItem(item: Partial<AssetLibraryItem>): AssetLibraryItem {
  return {
    id: typeof item.id === "string" && item.id.trim() ? item.id : makeId(),
    type: normalizeAssetType(item.type),
    name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "未命名资产",
    src: typeof item.src === "string" ? item.src : "",
    prompt: typeof item.prompt === "string" ? item.prompt : "",
    model: typeof item.model === "string" ? item.model : "",
    ratio: typeof item.ratio === "string" ? item.ratio : "",
    resolution: typeof item.resolution === "string" ? item.resolution : "",
    saveDirectory: typeof item.saveDirectory === "string" ? item.saveDirectory : "",
    createdAt: typeof item.createdAt === "string" && item.createdAt.trim() ? item.createdAt : now(),
  };
}

export function loadAssetLibrary(): AssetLibraryItem[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeItem(item)).filter((item) => item.src.trim());
  } catch {
    return [];
  }
}

export function saveAssetLibrary(items: AssetLibraryItem[]) {
  const normalized = items.map((item) => normalizeItem(item)).filter((item) => item.src.trim());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function addAssetLibraryItem(input: AssetLibraryInput): AssetLibraryItem {
  const item = normalizeItem({ ...input, id: makeId(), createdAt: now() });
  const library = loadAssetLibrary();
  saveAssetLibrary([item, ...library]);
  return item;
}

export function deleteAssetLibraryItem(id: string) {
  saveAssetLibrary(loadAssetLibrary().filter((item) => item.id !== id));
}

export function updateAssetLibraryItem(id: string, patch: Partial<Pick<AssetLibraryItem, "name" | "type" | "saveDirectory">>) {
  const next = loadAssetLibrary().map((item) => (item.id === id ? normalizeItem({ ...item, ...patch }) : item));
  saveAssetLibrary(next);
  return next.find((item) => item.id === id) ?? null;
}

export function clearAssetLibrary() {
  localStorage.removeItem(STORAGE_KEY);
}
